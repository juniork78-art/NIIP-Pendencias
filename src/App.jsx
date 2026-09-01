import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updatePassword
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot,
  deleteDoc,
  updateDoc,
  getDocs
} from 'firebase/firestore';

// Inserção dinâmica do Favicon (Letra "P" em negrito)
(() => {
  const faviconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#2f3437"/>
      <text x="32" y="47" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="46" font-weight="900" fill="#ffffff" text-anchor="middle">P</text>
    </svg>`;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(faviconSvg);
  document.head.appendChild(link);
})();

const style = document.createElement('style');
style.innerHTML = `
  @keyframes piscarNotion {
    0% { opacity: 1; }
    50% { opacity: 0.4; }
    100% { opacity: 1; }
  }
  .alerta-vencido-notion {
    color: #eb5757 !important;
    animation: piscarNotion 2s infinite;
    font-weight: 500;
  }
  .item-lista-piscando-notion {
    border-left: 3px solid #eb5757 !important;
    animation: piscarNotion 2s infinite;
  }

  input[type="date"] {
    color-scheme: light dark;
  }
  
  input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(0.5);
    cursor: pointer;
  }

  @media (max-width: 768px) {
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      overflow-x: hidden;
    }
    .app-container {
      padding: 12px !important;
      width: 100% !important;
    }
    .main-grid {
      grid-template-columns: 1fr !important;
      width: 100% !important;
      gap: 20px !important;
    }
  }
`;
document.head.appendChild(style);

const formatarDataParaBr = (dataStr) => {
  if (!dataStr) return '';
  try {
    const parts = dataStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dataStr;
  } catch (e) {
    return dataStr;
  }
};

const corrigirDatasNoTexto = (texto) => {
  if (!texto) return '';
  return texto.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, ano, mes, dia) => {
    return `${dia}/${mes}/${ano}`;
  });
};

const calcularStatusPrazo = (dataStr) => {
  if (!dataStr) return { status: 'normal', texto: '', diasAtraso: 0 };
  try {
    const parts = dataStr.split('-'); 
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dataPrazo = new Date(year, month, day);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const diffTime = dataPrazo - hoje;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const dataFormatada = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;

      if (diffDays < 0) return { status: 'vencido', texto: `Vencido há ${Math.abs(diffDays)} dia(s) (${dataFormatada})`, diasAtraso: Math.abs(diffDays) };
      if (diffDays === 0) return { status: 'hoje', texto: `Vence HOJE (${dataFormatada})`, diasAtraso: 0 };
      if (diffDays === 1) return { status: 'um_dia', texto: `Vence AMANHÃ (${dataFormatada})`, diasAtraso: 0 };
      if (diffDays <= 3) return { status: 'proximo', texto: `Vence em ${diffDays} dia(s) (${dataFormatada})`, diasAtraso: 0 };
      return { status: 'normal', texto: `Prazo: ${dataFormatada}`, diasAtraso: 0 };
    }
    return { status: 'normal', texto: '', diasAtraso: 0 };
  } catch (e) {
    return { status: 'normal', texto: '', diasAtraso: 0 };
  }
};

const INTEGRANTES_NIIP = ["Francisco", "Gabriel", "Walgney"];
const INTEGRANTES_NOC = ["Gustavo", "Stevan", "Gilvan", "Kessy", "João", "Lucas", "Tolentino"];
const INTEGRANTES_NMR = ["Dhennifer"];

const SETORES_DISPONIVEIS = [
  { 
    id: 'noc', 
    nome: 'NOC - Network Operations Center', 
    descricao: 'Monitoramento de rede, incidentes e controle de enlaces.'
  },
  { 
    id: 'nmr', 
    nome: 'NMR - Núcleo de Monitoramento', 
    descricao: 'Acompanhamento de alertas, métricas e supervisão contínua.'
  },
  { 
    id: 'niip', 
    nome: 'NIIP - Núcleo de Informática e Inspeção de POPs', 
    descricao: 'Gestão de tarefas, prazos e manutenções da infraestrutura de POPs.'
  }
];

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [paginaAtual, setPaginaAtual] = useState('andamento'); 
  
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const salvo = localStorage.getItem('darkMode_fibralink');
      if (salvo !== null) {
        return salvo === 'true';
      }
    } catch (e) {
      console.error("Erro ao ler localStorage", e);
    }
    return true;
  });

  const alternarTema = () => {
    const novoTema = !darkMode;
    setDarkMode(novoTema);
    try {
      localStorage.setItem('darkMode_fibralink', String(novoTema));
    } catch (e) {
      console.error("Erro ao salvar localStorage", e);
    }
  };
  
  const [tarefas, setTarefas] = useState([]);
  const [logsAuditoria, setLogsAuditoria] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescription] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('Média');
  const [responsavelSelecionadoGestor, setResponsavelSelecionadoGestor] = useState('');
  const [subPendenciasInput, setSubPendenciasInput] = useState('');
  
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');

  const [tarefaEditando, setTarefaEditando] = useState(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editPrazo, setEditPrazo] = useState('');
  const [editPrioridade, setEditPrioridade] = useState('');

  const [tarefaResolvendo, setTarefaResolvendo] = useState(null);
  const [detalhesResolucaoInput, setDetalhesResolucaoInput] = useState('');

  const [mostrarPopupAlerta, setMostrarPopupAlerta] = useState(false);
  const [tarefasUrgentesUsuario, setTarefasUrgentesUsuario] = useState([]);
  const [popupJaExibido, setPopupJaExibido] = useState(false);

  const [textoNovaSub, setTextoNovaSub] = useState({});

  const mudarPagina = (novaPagina) => {
    window.history.pushState({ pagina: novaPagina, setor: setorSelecionado }, '');
    setPaginaAtual(novaPagina);
  };

  const mudarSetor = (novoSetor) => {
    window.history.pushState({ pagina: 'andamento', setor: novoSetor }, '');
    setSetorSelecionado(novoSetor);
    setPaginaAtual('andamento');
  };

  useEffect(() => {
    if (usuarioLogado) {
      window.history.replaceState({ pagina: paginaAtual, setor: setorSelecionado }, '');
    }
  }, [usuarioLogado, setorSelecionado]);

  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state) {
        if (event.state.pagina) {
          setPaginaAtual(event.state.pagina);
        }
        if (event.state.setor !== undefined) {
          setSetorSelecionado(event.state.setor);
        }
      } else {
        setPaginaAtual('andamento');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const emailLower = user.email.toLowerCase();
        setUsuarioLogado(user.email);
        setPopupJaExibido(false);

        if (emailLower.includes('duandys')) {
          setSetorSelecionado(null);
        } else if (
          emailLower.includes('gustavo') || 
          emailLower.includes('stevan') || 
          emailLower.includes('gilvan') || 
          emailLower.includes('kessy') || 
          emailLower.includes('joao') || 
          emailLower.includes('lucas') || 
          emailLower.includes('tolentino')
        ) {
          setSetorSelecionado('noc');
        } else if (emailLower.includes('dhennifer')) {
          setSetorSelecionado('nmr');
        } else {
          setSetorSelecionado('niip');
        }
      } else {
        setUsuarioLogado(null);
        setSetorSelecionado(null);
        setPopupJaExibido(false);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const nomeFormatadoGlobal = usuarioLogado ? usuarioLogado.split('@')[0].replace('.', ' ').toUpperCase() : '';
  const isGestor = nomeFormatadoGlobal.includes('DUANDYS');

  useEffect(() => {
    if (usuarioLogado && setorSelecionado) {
      const unsub = onSnapshot(collection(db, `${setorSelecionado}_tarefas`), (snapshot) => {
        const lista = [];
        snapshot.forEach((docSnap) => {
          lista.push({ id: docSnap.id, ...docSnap.data() });
        });
        lista.sort((a, b) => b.criadoEm - a.criadoEm);
        setTarefas(lista);

        if (!popupJaExibido) {
          const minhasUrgentes = lista.filter(t => {
            if (t.status === 'Resolvida') return false;
            const isMeu = nomeFormatadoGlobal.includes(t.responsavel.toUpperCase());
            if (!isMeu) return false;
            const st = calcularStatusPrazo(t.prazo);
            return st.status === 'vencido' || st.status === 'hoje' || st.status === 'um_dia';
          });

          if (minhasUrgentes.length > 0) {
            setTarefasUrgentesUsuario(minhasUrgentes);
            setMostrarPopupAlerta(true);
            setPopupJaExibido(true);
          }
        }
      });

      const unsubLogs = onSnapshot(collection(db, `${setorSelecionado}_auditoria`), (snapshot) => {
        const logsLista = [];
        snapshot.forEach((docSnap) => {
          logsLista.push({ id: docSnap.id, ...docSnap.data() });
        });
        logsLista.sort((a, b) => b.timestamp - a.timestamp);
        setLogsAuditoria(logsLista);
      });

      return () => {
        unsub();
        unsubLogs();
      };
    }
  }, [usuarioLogado, setorSelecionado, nomeFormatadoGlobal, popupJaExibido]);

  useEffect(() => {
    const integrantes = 
      setorSelecionado === 'noc' ? INTEGRANTES_NOC :
      setorSelecionado === 'nmr' ? INTEGRANTES_NMR : INTEGRANTES_NIIP;
     
    if (integrantes.length > 0) {
      setResponsavelSelecionadoGestor(integrantes[0]);
    }
  }, [setorSelecionado]);
  
  const registrarLogAuditoria = async (acao, detalhes, tarefaTitulo) => {
    try {
      const logId = Date.now().toString() + "_" + Math.random().toString(36).substring(2, 7);
      await setDoc(doc(db, `${setorSelecionado}_auditoria`, logId), {
        usuario: nomeFormatadoGlobal,
        acao,
        detalhes,
        tarefaTitulo,
        timestamp: Date.now(),
        dataHoraFormatada: new Date().toLocaleString('pt-BR')
      });
    } catch (e) {
      console.error("Erro ao registrar log de auditoria", e);
    }
  };

  const excluirLogIndividual = async (logId) => {
    if (window.confirm("Deseja realmente excluir este registro de auditoria?")) {
      try {
        await deleteDoc(doc(db, `${setorSelecionado}_auditoria`, logId));
      } catch (e) {
        alert("Erro ao excluir log: " + e.message);
      }
    }
  };

  const apagarTodoHistoricoAuditoria = async () => {
    if (window.confirm("ATENÇÃO: Deseja realmente apagar TODO o histórico de auditoria deste setor? Esta ação não pode ser desfeita.")) {
      try {
        const querySnapshot = await getDocs(collection(db, `${setorSelecionado}_auditoria`));
        const promessas = querySnapshot.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(promessas);
        alert("Histórico de auditoria limpo com sucesso!");
      } catch (e) {
        alert("Erro ao limpar histórico: " + e.message);
      }
    }
  };

  const obterIntegrantesSetor = () => {
    if (setorSelecionado === 'noc') return INTEGRANTES_NOC;
    if (setorSelecionado === 'nmr') return INTEGRANTES_NMR;
    return INTEGRANTES_NIIP;
  };

  const integrantesAtuais = obterIntegrantesSetor();
   
  const emailLowerGlobal = usuarioLogado ? usuarioLogado.toLowerCase() : '';
  let nomeForcadoParaUsuario = null;
  if (emailLowerGlobal.includes('joao') || emailLowerGlobal.includes('joão') || nomeFormatadoGlobal.includes('JOAO') || nomeFormatadoGlobal.includes('JOÃO')) {
    nomeForcadoParaUsuario = 'João';
  }

  const responsavelFinal = isGestor 
    ? responsavelSelecionadoGestor 
    : nomeForcadoParaUsuario || (integrantesAtuais.find(n => nomeFormatadoGlobal.includes(n.toUpperCase())) || integrantesAtuais[0] || 'Gestor');

  const adicionarTarefa = async (e) => {
    e.preventDefault();
    if (!titulo.trim() || !prazo) {
      alert("Preencha o título e a data limite da tarefa!");
      return;
    }

    const novaTarefaId = Date.now().toString();

    const subPendenciasIniciais = subPendenciasInput
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(textoSub => ({
        id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 5),
        texto: textoSub,
        concluida: false
      }));

    const tarefaObj = {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      responsavel: responsavelFinal,
      prazo,
      prioridade,
      status: 'Pendente',
      criadoPor: nomeFormatadoGlobal,
      criadoEm: Date.now(),
      subTarefas: subPendenciasIniciais
    };

    try {
      await setDoc(doc(db, `${setorSelecionado}_tarefas`, novaTarefaId), tarefaObj);
      const prazoBr = formatarDataParaBr(prazo);
      await registrarLogAuditoria("CRIAÇÃO", `Criou a tarefa para [${responsavelFinal}] com prazo ${prazoBr} e prioridade ${prioridade}`, titulo.trim());
      setTitulo('');
      setDescription('');
      setPrazo('');
      setSubPendenciasInput('');
      alert("Tarefa cadastrada com sucesso!");
    } catch (err) {
      alert("Erro ao salvar tarefa: " + err.message);
    }
  };

  const abrirModalEdicao = (tarefa) => {
    setTarefaEditando(tarefa);
    setEditTitulo(tarefa.titulo || '');
    setEditDescricao(tarefa.descricao || '');
    setEditPrazo(tarefa.prazo || '');
    setEditPrioridade(tarefa.prioridade || 'Média');
  };

  const salvarEdicaoTarefa = async (e) => {
    e.preventDefault();
    if (!editTitulo.trim() || !editPrazo) {
      alert("Preencha o título e a data limite!");
      return;
    }

    try {
      let alteracoesStr = [];

      if ((tarefaEditando.titulo || '') !== editTitulo.trim()) {
        alteracoesStr.push(`Título alterado de "${tarefaEditando.titulo}" para "${editTitulo.trim()}"`);
      }
      if ((tarefaEditando.descricao || '') !== editDescricao.trim()) {
        alteracoesStr.push(`Relato alterado para: "${editDescricao.trim()}"`);
      }
      if (tarefaEditando.prazo !== editPrazo) {
        const antigoBr = formatarDataParaBr(tarefaEditando.prazo);
        const novoBr = formatarDataParaBr(editPrazo);
        alteracoesStr.push(`Prazo alterado de [${antigoBr}] para [${novoBr}]`);
      }
      if ((tarefaEditando.prioridade || 'Média') !== editPrioridade) {
        alteracoesStr.push(`Prioridade alterada de [${tarefaEditando.prioridade || 'Média'}] para [${editPrioridade}]`);
      }

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaEditando.id), {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim(),
        prazo: editPrazo,
        prioridade: editPrioridade
      });

      if (alteracoesStr.length > 0) {
        await registrarLogAuditoria("EDIÇÃO/ALTERAÇÃO", alteracoesStr.join(' | '), editTitulo.trim());
      }

      setTarefaEditando(null);
      alert("Tarefa atualizada com sucesso!");
    } catch (err) {
      alert("Erro ao atualizar tarefa: " + err.message);
    }
  };

  const abrirModalResolucao = (tarefa) => {
    setTarefaResolvendo(tarefa);
    setDetalhesResolucaoInput('');
  };

  const confirmarResolucaoTarefa = async (e) => {
    e.preventDefault();
    if (!detalhesResolucaoInput.trim()) {
      alert("Por favor, preencha o relato/detalhes de como a tarefa foi resolvida.");
      return;
    }

    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaResolvendo.id), { 
        status: 'Resolvida',
        detalhesResolucao: detalhesResolucaoInput.trim()
      });
      await registrarLogAuditoria("RESOLUÇÃO", `Resolução da pendência. Relato: "${detalhesResolucaoInput.trim()}"`, tarefaResolvendo.titulo);
      setTarefaResolvendo(null);
      setDetalhesResolucaoInput('');
      alert("Tarefa marcada como resolvida com sucesso!");
    } catch (err) {
      alert("Erro ao resolver tarefa: " + err.message);
    }
  };

  const reabrirTarefa = async (tarefa) => {
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefa.id), { 
        status: 'Pendente',
        detalhesResolucao: null 
      });
      await registrarLogAuditoria("REABERTURA", `Reabriu a tarefa`, tarefa.titulo);
    } catch (err) {
      alert("Erro ao reabrir tarefa: " + err.message);
    }
  };

  const excluirTarefa = async (id, tituloTarefa) => {
    if (window.confirm("Deseja realmente excluir esta tarefa do painel?")) {
      try {
        await deleteDoc(doc(db, `${setorSelecionado}_tarefas`, id));
        await registrarLogAuditoria("EXCLUSÃO", `Excluiu a tarefa`, tituloTarefa || 'Sem título');
      } catch (err) {
        alert("Erro ao excluir: " + err.message);
      }
    }
  };

  const adicionarSubPendencia = async (tarefaId, subTexto) => {
    if (!subTexto || !subTexto.trim()) return;
    try {
      const novaSub = {
        id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 5),
        texto: subTexto.trim(),
        concluida: false
      };
      
      const tarefaAtual = tarefas.find(t => t.id === tarefaId);
      const listaSub = tarefaAtual?.subTarefas || [];
      const novaLista = [...listaSub, novaSub];

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaId), {
        subTarefas: novaLista
      });

      setTextoNovaSub(prev => ({ ...prev, [tarefaId]: '' }));
    } catch (e) {
      alert("Erro ao adicionar sub-pendência: " + e.message);
    }
  };

  const alternarStatusSubPendencia = async (tarefaId, subId) => {
    try {
      const tarefaAtual = tarefas.find(t => t.id === tarefaId);
      if (!tarefaAtual || !tarefaAtual.subTarefas) return;

      const novaLista = tarefaAtual.subTarefas.map(sub => {
        if (sub.id === subId) {
          return { ...sub, concluida: !sub.concluida };
        }
        return sub;
      });

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaId), {
        subTarefas: novaLista
      });
    } catch (e) {
      alert("Erro ao atualizar sub-pendência: " + e.message);
    }
  };

  const excluirSubPendencia = async (tarefaId, subId) => {
    try {
      const tarefaAtual = tarefas.find(t => t.id === tarefaId);
      if (!tarefaAtual || !tarefaAtual.subTarefas) return;

      const novaLista = tarefaAtual.subTarefas.filter(sub => sub.id !== subId);

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaId), {
        subTarefas: novaLista
      });
    } catch (e) {
      alert("Erro ao excluir sub-pendência: " + e.message);
    }
  };

  // Cores Estilo Notion (Clean & Soft)
  const theme = {
    bg: darkMode ? '#191919' : '#fbfbfa',
    cardBg: darkMode ? '#202020' : '#ffffff',
    cardInner: darkMode ? '#262626' : '#f7f6f3',
    textMain: darkMode ? '#dbdbd7' : '#37352f',
    textMuted: darkMode ? '#9b9b95' : '#787774',
    border: darkMode ? '#2f2f2f' : '#e9e9e7',
    inputBg: darkMode ? '#262626' : '#ffffff',
    inputText: darkMode ? '#dbdbd7' : '#37352f',
    primary: '#2eaadc'
  };

  if (loadingAuth) {
    return <div style={{ color: theme.textMain, backgroundColor: theme.bg, textAlign: 'center', marginTop: '20vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', minHeight: '100vh' }}>Carregando workspace...</div>;
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={alternarTema} theme={theme} />;
  }

  const isGustavo = nomeFormatadoGlobal.includes('GUSTAVO');
  const isDhennifer = nomeFormatadoGlobal.includes('DHENNIFER');
  const isEspecialista = nomeFormatadoGlobal.includes('GILVAN') || nomeFormatadoGlobal.includes('STEVAN');
  const isNocN1 = nomeFormatadoGlobal.includes('TOLENTINO') || nomeFormatadoGlobal.includes('KESSY') || nomeFormatadoGlobal.includes('JOAO') || nomeFormatadoGlobal.includes('JOÃO') || nomeFormatadoGlobal.includes('LUCAS') || emailLowerGlobal.includes('joao');
  const isTecnicoN1 = nomeFormatadoGlobal.includes('FRANCISCO') || nomeFormatadoGlobal.includes('GABRIEL') || nomeFormatadoGlobal.includes('WALGNEY');
   
  const tipoCargo = isGestor 
    ? 'Gestor' 
    : isGustavo 
    ? 'NOC N3' 
    : isDhennifer 
    ? 'Analista N1' 
    : isEspecialista 
    ? 'Especialista' 
    : isNocN1 && setorSelecionado === 'noc'
    ? 'NOC N1' 
    : isTecnicoN1 && setorSelecionado === 'niip'
    ? 'NIIP N1'
    : isNocN1
    ? 'NOC N1'
    : isTecnicoN1
    ? 'Técnico N1'
    : 'Integrante';

  if (!setorSelecionado && isGestor) {
    return (
      <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', padding: '20px', boxSizing: 'border-box', position: 'relative' }}>
        <button 
          onClick={alternarTema}
          style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
        >
          {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
        </button>

        <div style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <div style={{ marginBottom: '24px' }}>
            <img 
              src="/logo.png" 
              alt="Logo Fibralink" 
              style={{ maxWidth: '170px', maxHeight: '55px', height: 'auto', objectFit: 'contain', display: 'inline-block' }} 
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: theme.textMain, marginBottom: '6px' }}>Selecione o Workspace</h1>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '32px' }}>Painel do Gestor — Escolha qual núcleo deseja gerenciar:</p>
           
          <div style={{ display: 'grid', gap: '12px' }}>
            {SETORES_DISPONIVEIS.map(setor => (
              <div 
                key={setor.id} 
                onClick={() => mudarSetor(setor.id)}
                style={{ 
                  background: theme.cardBg, 
                  border: `1px solid ${theme.border}`, 
                  padding: '16px 20px', 
                  borderRadius: '6px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner}
                onMouseLeave={(e) => e.currentTarget.style.background = theme.cardBg}
              >
                <h3 style={{ margin: '0 0 4px 0', color: theme.textMain, fontSize: '15px', fontWeight: '600' }}>{setor.nome}</h3>
                <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>{setor.descricao}</p>
              </div>
            ))}
          </div>

          <button 
            onClick={() => signOut(auth)} 
            style={{ marginTop: '28px', background: 'transparent', border: '1px solid #eb5757', color: '#eb5757', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
          >
            Encerrar Sessão
          </button>
      </div>
  </div>
  );
}

  const setorAtualInfo = SETORES_DISPONIVEIS.find(s => s.id === setorSelecionado) || SETORES_DISPONIVEIS[0];
  const pendenciasUrgentesCount = tarefas.filter(t => {
    if (t.status === 'Resolvida') return false;
    const st = calcularStatusPrazo(t.prazo);
    return st.status === 'vencido' || st.status === 'hoje' || st.status === 'um_dia';
  }).length;

  const tarefasAndamento = tarefas.filter(t => t.status !== 'Resolvida');
  const tarefasResolvidas = tarefas.filter(t => t.status === 'Resolvida');

  const tarefasFiltradas = tarefasAndamento.filter(t => {
    if (filtroResponsavel !== 'todos' && t.responsavel !== filtroResponsavel) return false;
    return true;
  });

  const classificarNivelResponsavel = (nomeResp) => {
    const nomeU = (nomeResp || '').toUpperCase();
    if (nomeU.includes('GILVAN') || nomeU.includes('STEVAN')) return 1; 
    if (nomeU.includes('GUSTAVO')) return 2; 
    return 3; 
  };

  const tarefasEspecialistas = tarefasFiltradas.filter(t => classificarNivelResponsavel(t.responsavel) === 1);
  const tarefasN3 = tarefasFiltradas.filter(t => classificarNivelResponsavel(t.responsavel) === 2);
  const tarefasN1 = tarefasFiltradas.filter(t => classificarNivelResponsavel(t.responsavel) === 3);

  if (paginaAtual === 'auditoria' && isGestor) {
    return (
      <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <img 
              src="/logo.png" 
              alt="Logo Fibralink" 
              style={{ maxWidth: '120px', maxHeight: '42px', height: 'auto', objectFit: 'contain', display: 'block' }} 
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                <button 
                  onClick={() => mudarPagina('andamento')} 
                  style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                >
                  ← Voltar
                </button>
                <span style={{ fontSize: '12px', color: '#d97706', fontWeight: '500' }}>Auditoria do Workspace</span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
                Gestor: <strong>{nomeFormatadoGlobal}</strong> ({setorAtualInfo.nome})
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={alternarTema}
              style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
            >
              {darkMode ? '☀️ Claro' : '🌙 Escuro'}
            </button>
            <button onClick={() => signOut(auth)} style={{ background: '#eb5757', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>Sair</button>
          </div>
        </header>

        <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '14px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: theme.textMain, fontSize: '16px', fontWeight: '600' }}>🔍 Histórico de Modificações</h3>
              <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
                Registro completo de todas as ações, edições e prazos alterados neste núcleo.
              </p>
            </div>
            {logsAuditoria.length > 0 && (
              <button 
                onClick={apagarTodoHistoricoAuditoria}
                style={{ background: '#eb5757', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}
              >
                🗑️ Limpar Histórico
              </button>
            )}
          </div>

          {logsAuditoria.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Nenhum registro de auditoria encontrado.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logsAuditoria.map((log) => (
                <div key={log.id} style={{ background: theme.cardInner, padding: '12px 14px', borderRadius: '4px', border: `1px solid ${theme.border}`, borderLeft: log.acao === 'RESOLUÇÃO' ? '3px solid #27ae60' : '3px solid #f2994a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ background: log.acao === 'RESOLUÇÃO' ? '#27ae60' : '#f2994a', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '600' }}>{log.acao}</span>
                      <strong style={{ fontSize: '13px', color: theme.textMain }}>{log.tarefaTitulo}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
                      👤 <strong>{log.usuario}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMain }}>
                      {corrigirDatasNoTexto(log.detalhes)}
                    </div>
                  </div>
                   
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%', gap: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
                      🕒 {log.dataHoraFormatada}
                    </div>
                    <button 
                      onClick={() => excluirLogIndividual(log.id)}
                      style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: '#eb5757', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (paginaAtual === 'resolvidas') {
    return (
      <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <img 
              src="/logo.png" 
              alt="Logo Fibralink" 
              style={{ maxWidth: '120px', maxHeight: '42px', height: 'auto', objectFit: 'contain', display: 'block' }} 
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                <button 
                  onClick={() => mudarPagina('andamento')} 
                  style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
                >
                  ← Voltar
                </button>
                <span style={{ fontSize: '12px', color: '#27ae60', fontWeight: '500' }}>{setorAtualInfo.nome} — Resolvidas</span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
                Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isGestor && (
              <button 
                onClick={() => mudarPagina('auditoria')}
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#d97706', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
              >
                Auditoria
              </button>
            )}
            <button 
              onClick={alternarTema}
              style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
            >
              {darkMode ? '☀️ Claro' : '🌙 Escuro'}
            </button>
            <button onClick={() => signOut(auth)} style={{ background: '#eb5757', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>Sair</button>
          </div>
        </header>

        <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '16px', fontWeight: '600', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px' }}>✅ Tarefas Resolvidas ({tarefasResolvidas.length})</h3>

          {tarefasResolvidas.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Nenhuma tarefa resolvida neste setor.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tarefasResolvidas.map((t) => (
                <div key={t.id} style={{ background: theme.cardInner, padding: '14px', borderRadius: '4px', borderLeft: '3px solid #27ae60', border: `1px solid ${theme.border}`, borderLeftWidth: '3px', opacity: 0.9, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', width: '100%' }}>
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: theme.textMain, fontWeight: '600', wordBreak: 'break-word', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{t.titulo}</span>
                      <span style={{ fontSize: '10px', color: '#27ae60', fontWeight: '500' }}>(Concluído)</span>
                    </h4>
                    {t.descricao && (
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: theme.textMuted, lineHeight: '1.4', wordBreak: 'break-word' }}>
                        {t.descricao}
                      </p>
                    )}
                    {t.detalhesResolucao && (
                      <div style={{ background: darkMode ? '#18251e' : '#edf7ed', padding: '8px 10px', borderRadius: '4px', marginBottom: '10px', borderLeft: '2px solid #27ae60' }}>
                        <span style={{ fontSize: '11px', color: '#27ae60', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Relato de Resolução:</span>
                        <p style={{ margin: 0, fontSize: '12px', color: theme.textMain, wordBreak: 'break-word' }}>{t.detalhesResolucao}</p>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
                    <span>👤 <strong style={{ color: theme.textMain }}>{t.responsavel}</strong></span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {isGestor && (
                        <button 
                          onClick={() => reabrirTarefa(t)}
                          style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#d97706', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                        >
                          Reabrir
                        </button>
                      )}
                      {isGestor && (
                        <button 
                          onClick={() => excluirTarefa(t.id, t.titulo)}
                          style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#eb5757', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box', position: 'relative' }}>
        
      {mostrarPopupAlerta && tarefasUrgentesUsuario.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '6px', width: '100%', maxWidth: '480px', border: `1px solid ${theme.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', boxSizing: 'border-box', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚨</div>
            <h2 style={{ margin: '0 0 8px 0', color: '#eb5757', fontSize: '18px', fontWeight: '600' }}>Atenção, {nomeFormatadoGlobal}!</h2>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '20px', lineHeight: '1.4' }}>
              Você possui <strong>{tarefasUrgentesUsuario.length}</strong> tarefa(s) sob sua responsabilidade com prazo crítico ou vencidas:
            </p>

          <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
            {tarefasUrgentesUsuario.map(t => {
              const st = calcularStatusPrazo(t.prazo);
              return (
                <div key={t.id} style={{ background: theme.cardInner, padding: '10px 12px', borderRadius: '4px', borderLeft: '3px solid #eb5757', border: `1px solid ${theme.border}`, borderLeftWidth: '3px' }}>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: theme.textMain, marginBottom: '2px' }}>{t.titulo}</div>
                  <div style={{ fontSize: '11px', color: '#eb5757', fontWeight: '500' }}>📅 {st.texto}</div>
                </div>
              );
            })}
        </div>

        <button 
          onClick={() => setMostrarPopupAlerta(false)}
          style={{ width: '100%', padding: '10px', background: '#37352f', color: '#fff', fontWeight: '500', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', border: 'none' }}
        >
          Entendido
        </button>
      </div>
    </div>
    )}

    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <img 
          src="/logo.png" 
          alt="Logo Fibralink" 
          style={{ maxWidth: '120px', maxHeight: '42px', height: 'auto', objectFit: 'contain', display: 'block' }} 
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
            {isGestor && (
              <button 
                onClick={() => mudarSetor(null)} 
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
              >
                ← Trocar Workspace
              </button>
            )}
            <span style={{ fontSize: '12px', color: theme.textMain, fontWeight: '600' }}>{setorAtualInfo.nome}</span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
            Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})
          </p>
      </div>
    </div>
      
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      {isGestor && (
        <button 
          onClick={() => mudarPagina('auditoria')}
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#d97706', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}
        >
          Auditoria
        </button>
      )}

      {pendenciasUrgentesCount > 0 && (
        <div style={{ background: darkMode ? '#3b1c1c' : '#fde8e8', color: '#eb5757', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', border: '1px solid #eb5757' }}>
          ⚠️ {pendenciasUrgentesCount} Urgente(s)
        </div>
      )}
        
      <button 
        onClick={() => mudarPagina('resolvidas')}
        style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#27ae60', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}
      >
        Resolvidas ({tarefasResolvidas.length})
      </button>

      <button 
        onClick={alternarTema}
        style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
      >
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <button onClick={() => signOut(auth)} style={{ background: '#eb5757', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>Sair</button>
    </div>
  </header>

  <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: '24px', alignItems: 'start', width: '100%', boxSizing: 'border-box' }}>
      
    <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '15px', fontWeight: '600', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>➕ Nova Tarefa</h3>
        
      <form onSubmit={adicionarTarefa}>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Título *</label>
          <input 
            type="text" 
            placeholder="Ex: Atualização geral de switches" 
            value={titulo} 
            onChange={(e) => setTitulo(e.target.value)} 
            required 
            style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }} 
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Descrição</label>
          <textarea 
            placeholder="Contexto ou observações..." 
            rows="2"
            value={descricao} 
            onChange={(e) => setDescription(e.target.value)} 
            style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical', fontSize: '13px' }} 
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Sub-pendências (uma por linha)</label>
          <textarea 
            placeholder="Verificar portas&#10;Backup de configs" 
            rows="2"
            value={subPendenciasInput} 
            onChange={(e) => setSubPendenciasInput(e.target.value)} 
            style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical', fontSize: '13px' }} 
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>
            {isGestor ? 'Responsável' : 'Responsável (Automático)'}
          </label>
          {isGestor ? (
            <select 
              value={responsavelSelecionadoGestor} 
              onChange={(e) => setResponsavelSelecionadoGestor(e.target.value)} 
              style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontWeight: '500', fontSize: '13px' }}
            >
              {integrantesAtuais.map(nome => (
                <option key={nome} value={nome}>{nome}</option>
              ))}
            </select>
          ) : (
            <input 
              type="text" 
              value={responsavelFinal} 
              disabled 
              style={{ width: '100%', padding: '8px 10px', background: darkMode ? '#181818' : '#f0f0ef', border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', boxSizing: 'border-box', fontWeight: '500', cursor: 'not-allowed', fontSize: '13px' }} 
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 130px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Prazo *</label>
            <input 
              type="date" 
              value={prazo} 
              onChange={(e) => setPrazo(e.target.value)} 
              required 
              style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }} 
            />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Prioridade</label>
            <select 
              value={prioridade} 
              onChange={(e) => setPrioridade(e.target.value)} 
              style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }}
            >
              <option value="Baixa">Baixa</option>
              <option value="Média">Média</option>
              <option value="Alta">Alta</option>
              <option value="Crítica">Crítica</option>
            </select>
          </div>
        </div>

        <button type="submit" style={{ width: '100%', padding: '10px', background: '#37352f', border: 'none', color: '#fff', fontWeight: '500', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
          Salvar Tarefa
        </button>
      </form>
    </div>

    <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
        
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, color: theme.textMain, fontSize: '15px', fontWeight: '600' }}>📋 Tarefas em Andamento</h3>
          
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '6px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
            <option value="todos">Responsável: Todos</option>
            {integrantesAtuais.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {tarefasFiltradas.length === 0 ? (
        <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '50px 0' }}>Nenhuma tarefa em andamento.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
            
          {tarefasEspecialistas.length > 0 && (
            <div style={{ background: theme.cardInner, padding: '12px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px', fontWeight: '600' }}>
                ⭐ Especialistas ({tarefasEspecialistas.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tarefasEspecialistas.map(t => renderizarItemListaNotion(t, theme, isGestor, nomeFormatadoGlobal, abrirModalEdicao, abrirModalResolucao, excluirTarefa, adicionarSubPendencia, alternarStatusSubPendencia, excluirSubPendencia, textoNovaSub, setTextoNovaSub))}
              </div>
            </div>
          )}

          {tarefasN3.length > 0 && (
            <div style={{ background: theme.cardInner, padding: '12px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#2eaadc', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px', fontWeight: '600' }}>
                🔷 NOC N3 ({tarefasN3.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tarefasN3.map(t => renderizarItemListaNotion(t, theme, isGestor, nomeFormatadoGlobal, abrirModalEdicao, abrirModalResolucao, excluirTarefa, adicionarSubPendencia, alternarStatusSubPendencia, excluirSubPendencia, textoNovaSub, setTextoNovaSub))}
              </div>
            </div>
          )}

          {tarefasN1.length > 0 && (
            <div style={{ background: theme.cardInner, padding: '12px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#27ae60', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px', fontWeight: '600' }}>
                🟢 N1 ({tarefasN1.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tarefasN1.map(t => renderizarItemListaNotion(t, theme, isGestor, nomeFormatadoGlobal, abrirModalEdicao, abrirModalResolucao, excluirTarefa, adicionarSubPendencia, alternarStatusSubPendencia, excluirSubPendencia, textoNovaSub, setTextoNovaSub))}
              </div>
            </div>
          )}

        </div>
      )}

    </div>

  </div>

  {tarefaEditando && (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px', boxSizing: 'border-box' }}>
      <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '6px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '16px', fontWeight: '600', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>✏️ Editar Tarefa</h3>
          
        <form onSubmit={salvarEdicaoTarefa}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Título *</label>
            <input 
              type="text" 
              value={editTitulo} 
              onChange={(e) => setEditTitulo(e.target.value)} 
              required 
              style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }} 
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Descrição</label>
            <textarea 
              rows="3"
              value={editDescricao} 
              onChange={(e) => setEditDescricao(e.target.value)} 
              style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical', fontSize: '13px' }} 
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 130px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Prazo *</label>
              <input 
                type="date" 
                value={editPrazo} 
                onChange={(e) => setEditPrazo(e.target.value)} 
                required 
                style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }} 
              />
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Prioridade</label>
              <select 
                value={editPrioridade} 
                onChange={(e) => setEditPrioridade(e.target.value)} 
                style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }}
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Crítica">Crítica</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              type="button" 
              onClick={() => setTarefaEditando(null)}
              style={{ flex: 1, padding: '8px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            style={{ flex: 1, padding: '8px', background: '#37352f', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  </div>
)}

{tarefaResolvendo && (
  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px', boxSizing: 'border-box' }}>
    <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '6px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 8px 0', color: '#27ae60', fontSize: '16px', fontWeight: '600' }}>✔ Resolver Tarefa</h3>
      <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px', lineHeight: '1.4' }}>
        Relato de conclusão para: <strong>{tarefaResolvendo.titulo}</strong>
      </p>
         
      <form onSubmit={confirmarResolucaoTarefa}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Detalhes da Resolução *</label>
          <textarea 
            rows="3"
            placeholder="Ex: Enlace estabilizado com sucesso."
            value={detalhesResolucaoInput} 
            onChange={(e) => setDetalhesResolucaoInput(e.target.value)} 
            required 
            style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical', fontSize: '13px' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            onClick={() => setTarefaResolvendo(null)}
            style={{ flex: 1, padding: '8px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            style={{ flex: 1, padding: '8px', background: '#27ae60', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}
          >
            Confirmar
          </button>
        </div>
      </form>
    </div>
  </div>
)}

</div>
  );
}

function renderizarItemListaNotion(t, theme, isGestor, nomeFormatadoGlobal, abrirModalEdicao, abrirModalResolucao, excluirTarefa, adicionarSubPendencia, alternarStatusSubPendencia, excluirSubPendencia, textoNovaSub, setTextoNovaSub) {
  const infoPrazo = calcularStatusPrazo(t.prazo);
  
  const normalizarTexto = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const isResponsavelPelaTarefa = normalizarTexto(nomeFormatadoGlobal).includes(normalizarTexto(t.responsavel));
  
  const podeAgerir = isGestor || isResponsavelPelaTarefa;
  const isUrgente = infoPrazo.status === 'vencido' || infoPrazo.status === 'hoje' || infoPrazo.status === 'um_dia';

  const subTarefas = t.subTarefas || [];
  const subConcluidas = subTarefas.filter(s => s.concluida).length;

  return (
    <div key={t.id} className={`item-lista-tarefa ${isUrgente ? 'item-lista-piscando-notion' : ''}`} style={{ background: theme.cardBg, padding: '14px', borderRadius: '4px', border: `1px solid ${theme.border}`, borderLeft: isUrgente ? undefined : `3px solid #2eaadc`, display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box', width: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.01)' }}>
      
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '14px', color: theme.textMain, fontWeight: '600', wordBreak: 'break-word' }}>
              {t.titulo}
            </h4>
            <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '3px', background: t.prioridade === 'Crítica' ? '#eb5757' : t.prioridade === 'Alta' ? '#f2994a' : theme.cardInner, color: t.prioridade === 'Crítica' || t.prioridade === 'Alta' ? '#fff' : theme.textMuted, fontWeight: '600', border: `1px solid ${theme.border}` }}>
              {t.prioridade}
            </span>
          </div>
          {t.descricao && (
            <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: theme.textMuted, lineHeight: '1.4', wordBreak: 'break-word' }}>
              {t.descricao}
            </p>
          )}
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {podeAgerir && (
            <button 
              onClick={() => abrirModalEdicao(t)}
              style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
            >
              Editar
            </button>
          )}
          {podeAgerir && (
            <button 
              onClick={() => abrirModalResolucao(t)}
              style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
            >
              Resolver
            </button>
          )}
          {isGestor && (
            <button 
              onClick={() => excluirTarefa(t.id, t.titulo)}
              style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: '#eb5757', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      {/* Bloco de Sub-pendências (Checklist Notion style) */}
      <div style={{ background: theme.cardInner, padding: '8px 10px', borderRadius: '4px', border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted }}>
            Sub-tarefas ({subConcluidas}/{subTarefas.length})
          </span>
        </div>

        {subTarefas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '6px' }}>
            {subTarefas.map(sub => (
              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, wordBreak: 'break-word', color: sub.concluida ? theme.textMuted : theme.textMain, textDecoration: sub.concluida ? 'line-through' : 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={sub.concluida} 
                    onChange={() => alternarStatusSubPendencia(t.id, sub.id)}
                    style={{ cursor: 'pointer', accentColor: '#2eaadc' }}
                  />
                  <span>{sub.texto}</span>
                </label>
                {podeAgerir && (
                  <button 
                    onClick={() => excluirSubPendencia(t.id, sub.id)}
                    style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '10px', padding: '2px' }}
                    title="Remover"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input Notion inline para nova sub-pendência */}
        {podeAgerir && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <input 
              type="text" 
              placeholder="+ Adicionar item..." 
              value={textoNovaSub[t.id] || ''}
              onChange={(e) => setTextoNovaSub(prev => ({ ...prev, [t.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionarSubPendencia(t.id, textoNovaSub[t.id]);
                }
              }}
              style={{ flex: 1, padding: '4px 6px', fontSize: '11px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '3px' }}
            />
          </div>
        )}
      </div>

      {/* Rodapé: Responsável e Prazo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
        <div>
          👤 <strong style={{ color: theme.textMain }}>{t.responsavel}</strong>
        </div>
        <div>
          <span className={isUrgente ? 'alerta-vencido-notion' : ''} style={{ color: infoPrazo.status === 'normal' ? theme.textMuted : undefined }}>
            📅 {infoPrazo.texto}
          </span>
        </div>
      </div>

    </div>
  );
}

function TelaLogin({ onLoginSucesso, darkMode, setDarkMode, theme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const [alterarSenhaMode, setAlterarSenhaMode] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setMensagemSucesso('');
    try {
      const result = await signInWithEmailAndPassword(auth, email, senha);
      onLoginSucesso(result.user.email);
    } catch (e) {
      setErro(`Erro ao entrar: Verifique seu e-mail e senha.`);
    }
  };

  const handleAlterarSenha = async (e) => {
    e.preventDefault();
    setErro('');
    setMensagemSucesso('');
    if (!email.trim() || !senha.trim() || !senhaNova.trim()) {
      setErro("Preencha todos os campos para alterar a senha.");
      return;
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      await updatePassword(userCredential.user, senhaNova);
      setMensagemSucesso("Senha alterada com sucesso!");
      setSenha('');
      setSenhaNova('');
      setAlterarSenhaMode(false);
    } catch (e) {
      setErro("Erro ao alterar senha: Verifique os dados informados.");
    }
  };

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box', padding: '20px', position: 'relative' }}>
      <button 
        type="button"
        onClick={setDarkMode}
        style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}
      >
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <form onSubmit={alterarSenhaMode ? handleAlterarSenha : handleLogin} style={{ background: theme.cardBg, padding: '32px 24px', borderRadius: '6px', width: '100%', maxWidth: '360px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
          
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img 
            src="/logo.png" 
            alt="Logo Fibralink" 
            style={{ maxWidth: '170px', maxHeight: '55px', height: 'auto', objectFit: 'contain', display: 'inline-block', marginBottom: '6px' }} 
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500', display: 'block' }}>NOC • NMR • NIIP</span>
        </div>

        {erro && <p style={{ color: '#eb5757', fontSize: '12px', marginBottom: '14px', background: darkMode ? '#3b1c1c' : '#fde8e8', padding: '8px', borderRadius: '4px' }}>{erro}</p>}
        {mensagemSucesso && <p style={{ color: '#27ae60', fontSize: '12px', marginBottom: '14px', background: darkMode ? '#18251e' : '#edf7ed', padding: '8px', borderRadius: '4px' }}>{mensagemSucesso}</p>}
          
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '4px', color: theme.textMuted }}>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@fibralink.net.br" style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '4px', color: theme.textMuted }}>
            {alterarSenhaMode ? 'Senha Atual' : 'Senha'}
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={mostrarSenha ? 'text' : 'password'} 
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              required 
              style={{ width: '100%', padding: '8px 10px', paddingRight: '36px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} 
            />
            <button 
              type="button" 
              onClick={() => setMostrarSenha(!mostrarSenha)} 
              style={{ position: 'absolute', right: '8px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', color: theme.textMuted }}
              title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
          >
            {mostrarSenha ? '👁️' : '🔒'}
          </button>
          </div>
        </div>

        {alterarSenhaMode && (
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '4px', color: theme.textMuted }}>Nova Senha</label>
            <input type={mostrarSenha ? 'text' : 'password'} value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} required style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
          </div>
      )}

      <button type="submit" style={{ width: '100%', padding: '10px', background: '#37352f', border: 'none', color: '#fff', fontWeight: '500', borderRadius: '4px', cursor: 'pointer', marginBottom: '12px', fontSize: '13px' }}>
        {alterarSenhaMode ? 'Atualizar Senha' : 'Entrar'}
      </button>

      <div style={{ textAlign: 'center' }}>
        <button 
          type="button" 
          onClick={() => { setAlterarSenhaMode(!alterarSenhaMode); setErro(''); setMensagemSucesso(''); }}
          style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
      >
        {alterarSenhaMode ? '← Voltar para o Login' : 'Alterar minha senha'}
      </button>
      </div>
    </form>
  </div>
  );
}

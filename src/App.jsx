import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
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

// Inserção dinâmica do Favicon
(() => {
  try {
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
  } catch (e) {}
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
  .linha-tabela-piscando {
    background-color: rgba(235, 87, 87, 0.08) !important;
    animation: piscarNotion 2s infinite;
  }
  input[type="date"] {
    color-scheme: light dark;
  }
  input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(0.5);
    cursor: pointer;
  }
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(120, 119, 116, 0.3);
    border-radius: 3px;
  }
  @media (max-width: 768px) {
    .workspace-layout {
      flex-direction: column !important;
    }
    .sidebar-notion {
      width: 100% !important;
      height: auto !important;
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
  { id: 'noc', nome: 'NOC - Network Operations Center', descricao: 'Monitoramento de rede, incidentes e controle de enlaces.' },
  { id: 'nmr', nome: 'NMR - Núcleo de Monitoramento', descricao: 'Acompanhamento de alertas, métricas e supervisão contínua.' },
  { id: 'niip', nome: 'NIIP - Núcleo de Informática e Inspeção de POPs', descricao: 'Gestão de tarefas, prazos e manutenções da infraestrutura de POPs.' }
];

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [paginaAtual, setPaginaAtual] = useState('andamento'); 
  
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const salvo = localStorage.getItem('darkMode_fibralink');
      if (salvo !== null) return salvo === 'true';
    } catch (e) {}
    return true;
  });

  const alternarTema = () => {
    const novoTema = !darkMode;
    setDarkMode(novoTema);
    try {
      localStorage.setItem('darkMode_fibralink', String(novoTema));
    } catch (e) {}
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

  const [paginaAberta, setPaginaAberta] = useState(null);
  const [editTituloPagina, setEditTituloPagina] = useState('');
  const [editDescricaoPagina, setEditDescricaoPagina] = useState('');

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

  const [expandidoIds, setExpandidoIds] = useState({});

  const alternarExpandido = (id) => {
    setExpandidoIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const mudarPagina = (novaPagina) => {
    setPaginaAberta(null);
    setPaginaAtual(novaPagina);
  };

  const mudarSetor = (novoSetor) => {
    setPaginaAberta(null);
    setSetorSelecionado(novoSetor);
    setPaginaAtual('andamento');
  };

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

        if (paginaAberta) {
          const atualizada = lista.find(t => t.id === paginaAberta.id);
          if (atualizada) setPaginaAberta(atualizada);
        }

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
    } catch (e) {}
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
    if (window.confirm("ATENÇÃO: Deseja realmente apagar TODO o histórico de auditoria deste setor?")) {
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
    if (!titulo.trim()) {
      alert("Preencha o título da página!");
      return;
    }

    const novaTarefaId = Date.now().toString();
    const hojeStr = new Date().toISOString().split('T')[0];

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
      descricao: descricao.trim() || 'Particular',
      responsavel: responsavelFinal,
      prazo: prazo || hojeStr,
      prioridade,
      status: 'Pendente',
      criadoPor: nomeFormatadoGlobal,
      criadoEm: Date.now(),
      subTarefas: subPendenciasIniciais
    };

    try {
      await setDoc(doc(db, `${setorSelecionado}_tarefas`, novaTarefaId), tarefaObj);
      await registrarLogAuditoria("CRIAÇÃO", `Criou a página para [${responsavelFinal}]`, titulo.trim());
      setTitulo('');
      setDescription('');
      setPrazo('');
      setSubPendenciasInput('');
    } catch (err) {
      alert("Erro ao salvar página: " + err.message);
    }
  };

  const adicionarSubPendenciaRapida = async (tarefaId) => {
    const subTexto = prompt("Digite o título da nova sub-tarefa:");
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

      setExpandidoIds(prev => ({ ...prev, [tarefaId]: true }));
    } catch (e) {
      alert("Erro ao adicionar sub-tarefa: " + e.message);
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
    } catch (e) {}
  };

  const excluirSubPendencia = async (tarefaId, subId) => {
    try {
      const tarefaAtual = tarefas.find(t => t.id === tarefaId);
      if (!tarefaAtual || !tarefaAtual.subTarefas) return;

      const novaLista = tarefaAtual.subTarefas.filter(sub => sub.id !== subId);

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaId), {
        subTarefas: novaLista
      });
    } catch (e) {}
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
    if (!editTitulo.trim() || !editPrazo) return;

    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaEditando.id), {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim(),
        prazo: editPrazo,
        prioridade: editPrioridade
      });

      await registrarLogAuditoria("EDIÇÃO", `Atualizou a página "${editTitulo.trim()}"`, editTitulo.trim());
      setTarefaEditando(null);
    } catch (err) {}
  };

  const abrirModalResolucao = (tarefa) => {
    setTarefaResolvendo(tarefa);
    setDetalhesResolucaoInput('');
  };

  const confirmarResolucaoTarefa = async (e) => {
    e.preventDefault();
    if (!detalhesResolucaoInput.trim()) return;

    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaResolvendo.id), { 
        status: 'Resolvida',
        detalhesResolucao: detalhesResolucaoInput.trim()
      });
      await registrarLogAuditoria("RESOLUÇÃO", `Concluiu a página`, tarefaResolvendo.titulo);
      setTarefaResolvendo(null);
      if (paginaAberta && paginaAberta.id === tarefaResolvendo.id) setPaginaAberta(null);
    } catch (err) {}
  };

  const reabrirTarefa = async (tarefa) => {
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefa.id), { 
        status: 'Pendente',
        detalhesResolucao: null 
      });
      await registrarLogAuditoria("REABERTURA", `Reabriu a página`, tarefa.titulo);
    } catch (err) {}
  };

  const excluirTarefa = async (id, tituloTarefa) => {
    if (window.confirm("Deseja realmente excluir esta página?")) {
      try {
        await deleteDoc(doc(db, `${setorSelecionado}_tarefas`, id));
        await registrarLogAuditoria("EXCLUSÃO", `Excluiu a página`, tituloTarefa || 'Sem título');
        if (paginaAberta && paginaAberta.id === id) setPaginaAberta(null);
      } catch (err) {}
    }
  };

  const salvarAlteracoesPaginaAberta = async () => {
    if (!paginaAberta || !editTituloPagina.trim()) return;
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, paginaAberta.id), {
        titulo: editTituloPagina.trim(),
        descricao: editDescricaoPagina.trim()
      });
      setPaginaAberta(prev => ({ ...prev, titulo: editTituloPagina.trim(), descricao: editDescricaoPagina.trim() }));
    } catch (e) {}
  };

  const theme = {
    bg: darkMode ? '#191919' : '#fbfbfa',
    sidebarBg: darkMode ? '#202020' : '#f7f6f3',
    cardBg: darkMode ? '#202020' : '#ffffff',
    cardInner: darkMode ? '#262626' : '#f7f6f3',
    textMain: darkMode ? '#dbdbd7' : '#37352f',
    textMuted: darkMode ? '#9b9b95' : '#787774',
    border: darkMode ? '#2f2f2f' : '#e9e9e7',
    inputBg: darkMode ? '#262626' : '#ffffff',
    inputText: darkMode ? '#dbdbd7' : '#37352f',
    primary: '#2eaadc',
    treeLine: darkMode ? '#444440' : '#d3d3ce'
  };

  if (loadingAuth) {
    return <div style={{ color: '#fff', backgroundColor: '#191919', textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif', minHeight: '100vh', padding: '20px' }}>Carregando workspace...</div>;
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={alternarTema} theme={theme} />;
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

  if (paginaAtual === 'auditoria' && isGestor) {
    return (
      <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '24px' }}>
          <button onClick={() => mudarPagina('andamento')} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>← Voltar para Biblioteca</button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={alternarTema} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>{darkMode ? '☀️ Claro' : '🌙 Escuro'}</button>
            <button onClick={() => signOut(auth)} style={{ background: '#eb5757', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Sair</button>
          </div>
        </header>
        <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>🔍 Histórico de Auditoria</h3>
          {logsAuditoria.length === 0 ? <p style={{ color: theme.textMuted, fontSize: '13px' }}>Nenhum registro encontrado.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logsAuditoria.map(log => (
                <div key={log.id} style={{ background: theme.cardInner, padding: '12px', borderRadius: '4px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ background: '#2eaadc', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold' }}>{log.acao}</span>
                    <strong style={{ fontSize: '13px', marginLeft: '8px' }}>{log.tarefaTitulo}</strong>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>Usuário: {log.usuario} — {corrigirDatasNoTexto(log.detalhes)}</div>
                  </div>
                  <button onClick={() => excluirLogIndividual(log.id)} style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '12px' }}>Excluir</button>
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
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '16px', marginBottom: '24px' }}>
          <button onClick={() => mudarPagina('andamento')} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>← Voltar para Biblioteca</button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={alternarTema} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>{darkMode ? '☀️ Claro' : '🌙 Escuro'}</button>
            <button onClick={() => signOut(auth)} style={{ background: '#eb5757', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Sair</button>
          </div>
        </header>
        <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '6px', border: `1px solid ${theme.border}` }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>✅ Páginas Resolvidas ({tarefasResolvidas.length})</h3>
          {tarefasResolvidas.length === 0 ? <p style={{ color: theme.textMuted, fontSize: '13px' }}>Nenhuma página resolvida.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tarefasResolvidas.map(t => (
                <div key={t.id} style={{ background: theme.cardInner, padding: '12px', borderRadius: '4px', borderLeft: '3px solid #27ae60', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>{t.titulo}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>Resolução: {t.detalhesResolucao}</p>
                  </div>
                  {isGestor && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => reabrirTarefa(t)} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#d97706', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Reabrir</button>
                      <button onClick={() => excluirTarefa(t.id, t.titulo)} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#eb5757', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Excluir</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-layout" style={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
      
      {/* SIDEBAR ESQUERDA NOTION */}
      <div className="sidebar-notion" style={{ width: '260px', background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '12px 8px', boxSizing: 'border-box', flexShrink: '0' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', marginBottom: '16px', background: theme.cardBg, border: `1px solid ${theme.border}` }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2eaadc', color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {nomeFormatadoGlobal.charAt(0) || 'J'}
          </div>
          <span style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Espaço de {nomeFormatadoGlobal || 'Usuário'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px', marginBottom: '16px' }}>
          <div onClick={() => mudarPagina('andamento')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: !paginaAberta && paginaAtual === 'andamento' ? theme.cardInner : 'transparent' }}>
            <span>🏠</span> <span>Página inicial</span>
          </div>
          <div onClick={() => mudarPagina('resolvidas')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer' }}>
            <span>✅</span> <span>Resolvidas ({tarefasResolvidas.length})</span>
          </div>
        </div>

        <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, padding: '0 8px', marginBottom: '6px', textTransform: 'uppercase' }}>
          Páginas Recentes
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px', overflowY: 'auto', maxHeight: '40vh', marginBottom: '20px' }}>
          {tarefasAndamento.map(t => (
            <div 
              key={t.id} 
              onClick={() => { setPaginaAberta(t); setEditTituloPagina(t.titulo); setEditDescricaoPagina(t.descricao || ''); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', background: paginaAberta?.id === t.id ? theme.cardInner : 'transparent', color: paginaAberta?.id === t.id ? theme.textMain : theme.textMuted }}
            >
              <span>📄</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, padding: '0 8px', marginBottom: '6px', textTransform: 'uppercase' }}>
          Núcleo
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px', marginBottom: '20px' }}>
          {SETORES_DISPONIVEIS.map(s => (
            <div 
              key={s.id} 
              onClick={() => mudarSetor(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', background: setorSelecionado === s.id ? theme.cardInner : 'transparent', color: setorSelecionado === s.id ? theme.textMain : theme.textMuted, fontWeight: setorSelecionado === s.id ? '600' : '400' }}
            >
              <span>📁</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nome.split(' - ')[0]}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
          {isGestor && (
            <button onClick={() => mudarSetor(null)} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', textAlign: 'left' }}>
              🔄 Trocar Workspace
            </button>
          )}
          <button onClick={() => signOut(auth)} style={{ background: 'transparent', border: '1px solid #eb5757', color: '#eb5757', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', textAlign: 'left' }}>
            Sair
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 32px', boxSizing: 'border-box', overflowY: 'auto' }}>
        
        {mostrarPopupAlerta && tarefasUrgentesUsuario.length > 0 && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '6px', width: '100%', maxWidth: '480px', border: `1px solid ${theme.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚨</div>
              <h2 style={{ margin: '0 0 8px 0', color: '#eb5757', fontSize: '18px', fontWeight: '600' }}>Atenção, {nomeFormatadoGlobal}!</h2>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '20px' }}>Você possui <strong>{tarefasUrgentesUsuario.length}</strong> tarefa(s) crítica(s) ou vencida(s):</p>
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                {tarefasUrgentesUsuario.map(t => (
                  <div key={t.id} style={{ background: theme.cardInner, padding: '8px 10px', borderRadius: '4px', borderLeft: '3px solid #eb5757' }}>
                    <div style={{ fontWeight: '600', fontSize: '12px' }}>{t.titulo}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setMostrarPopupAlerta(false)} style={{ width: '100%', padding: '10px', background: '#37352f', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '500', cursor: 'pointer' }}>Entendido</button>
            </div>
          </div>
        )}

        {paginaAberta ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: theme.textMuted, marginBottom: '24px' }}>
              <span onClick={() => setPaginaAberta(null)} style={{ cursor: 'pointer' }}>Biblioteca</span>
              <span>/</span>
              <span>{paginaAberta.titulo}</span>
            </div>

            <input 
              type="text" 
              value={editTituloPagina} 
              onChange={(e) => { setEditTituloPagina(e.target.value); }}
              onBlur={salvarAlteracoesPaginaAberta}
              style={{ fontSize: '36px', fontWeight: '700', color: theme.textMain, background: 'transparent', border: 'none', outline: 'none', width: '100%', marginBottom: '16px' }}
            />

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500' }}>Conteúdo / Bloco de Notas</label>
              <textarea 
                rows="8"
                value={editDescricaoPagina}
                onChange={(e) => { setEditDescricaoPagina(e.target.value); }}
                onBlur={salvarAlteracoesPaginaAberta}
                placeholder="Clique na barra de espaço para ativar a IA ou '/' para acessar os comandos..."
                style={{ width: '100%', padding: '12px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', fontSize: '14px', resize: 'vertical', lineHeight: '1.6' }}
              />
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
              <button onClick={() => abrirModalResolucao(paginaAberta)} style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>✔ Concluir Página</button>
              <button onClick={() => setPaginaAberta(null)} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>← Voltar à Biblioteca</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ margin: '0 0 4px 0', fontSize: '28px', fontWeight: '700', color: theme.textMain }}>Biblioteca</h1>
                <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>{setorAtualInfo.nome} • Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})</p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={alternarTema} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                  {darkMode ? '☀️ Claro' : '🌙 Escuro'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px', marginBottom: '20px', fontSize: '13px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '600', color: theme.textMain, borderBottom: `2px solid ${theme.textMain}`, paddingBottom: '8px', marginBottom: '-9px' }}>🕒 Recentes</span>
              <span style={{ color: theme.textMuted, cursor: 'pointer' }}>⭐ Favoritos</span>
              <span style={{ color: theme.textMuted, cursor: 'pointer' }}>🔒 Particular</span>
              
              <div style={{ marginLeft: 'auto' }}>
                <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '4px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
                  <option value="todos">Responsável: Todos</option>
                  {integrantesAtuais.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start', width: '100%' }}>
              
              {/* Formulário para criar Título e depois Adicionar Sub-tarefas */}
              <div style={{ background: theme.cardBg, padding: '16px', borderRadius: '6px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
                <h3 style={{ margin: '0 0 14px 0', color: theme.textMain, fontSize: '14px', fontWeight: '600', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>➕ Nova Tarefa</h3>
                
                <form onSubmit={adicionarTarefa}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Título da Página *</label>
                    <input 
                      type="text" 
                      placeholder="Ex: pop camera" 
                      value={titulo} 
                      onChange={(e) => setTitulo(e.target.value)} 
                      required 
                      style={{ width: '100%', padding: '6px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '12px' }} 
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Fonte / Descrição</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Particular ou pop camera" 
                      value={descricao} 
                      onChange={(e) => setDescription(e.target.value)} 
                      style={{ width: '100%', padding: '6px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '12px' }} 
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Sub-tarefas (uma por linha)</label>
                    <textarea 
                      placeholder="alarme&#10;ip" 
                      rows="2"
                      value={subPendenciasInput} 
                      onChange={(e) => setSubPendenciasInput(e.target.value)} 
                      style={{ width: '100%', padding: '6px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical', fontSize: '12px' }} 
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Responsável</label>
                    {isGestor ? (
                      <select value={responsavelSelecionadoGestor} onChange={(e) => setResponsavelSelecionadoGestor(e.target.value)} style={{ width: '100%', padding: '6px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
                        {integrantesAtuais.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={responsavelFinal} disabled style={{ width: '100%', padding: '6px 8px', background: darkMode ? '#181818' : '#f0f0ef', border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', fontSize: '12px' }} />
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Prazo *</label>
                      <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} required style={{ width: '100%', padding: '6px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }} />
                    </div>
                  </div>

                  <button type="submit" style={{ width: '100%', padding: '8px', background: '#37352f', border: 'none', color: '#fff', fontWeight: '500', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                    Criar Tarefa
                  </button>
                </form>
              </div>

              {/* TABELA DE TAREFAS ESTILO NOTION */}
              <div style={{ background: theme.cardBg, borderRadius: '6px', border: `1px solid ${theme.border}`, overflowX: 'auto', width: '100%', boxSizing: 'border-box' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, fontSize: '12px', fontWeight: '600', color: theme.textMuted, background: theme.cardInner, minWidth: '650px' }}>
                  <div>Nome da página</div>
                  <div>Criado por</div>
                  <div>Fonte</div>
                  <div>Última edição</div>
                  <div>Status / Prazo</div>
                </div>

                {tarefasFiltradas.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Nenhuma página na biblioteca.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: '650px' }}>
                    {tarefasFiltradas.map(t => {
                      const infoPrazo = calcularStatusPrazo(t.prazo);
                      const isUrgente = infoPrazo.status === 'vencido' || infoPrazo.status === 'hoje' || infoPrazo.status === 'um_dia';
                      const subTarefas = t.subTarefas || [];
                      const isExpandido = expandidoIds[t.id];

                      return (
                        <React.Fragment key={t.id}>
                          <div className={isUrgente ? 'linha-tabela-piscando' : ''} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center', fontSize: '13px' }} onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                              <span onClick={() => alternarExpandido(t.id)} style={{ cursor: 'pointer', fontSize: '10px', color: theme.textMuted, userSelect: 'none', padding: '2px' }}>
                                {isExpandido ? '▼' : '▶'}
                              </span>
                              <span>📄</span>
                              <span 
                                onClick={() => { setPaginaAberta(t); setEditTituloPagina(t.titulo); setEditDescricaoPagina(t.descricao || ''); }}
                                style={{ fontWeight: '500', color: theme.textMain, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {t.titulo}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.textMuted, fontSize: '12px' }}>
                              <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#2eaadc', color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>J</span>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.responsavel}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: theme.textMuted, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <span>🔒</span> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.descricao || 'Particular'}</span>
                            </div>

                            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                              Agora há pouco
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <span className={isUrgente ? 'alerta-vencido-notion' : ''} style={{ fontSize: '11px', color: infoPrazo.status === 'normal' ? theme.textMuted : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                📅 {infoPrazo.texto || t.prazo}
                              </span>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => abrirModalEdicao(t)} title="Editar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                                <button onClick={() => abrirModalResolucao(t)} title="Concluir" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>✔</button>
                                {isGestor && (
                                  <button onClick={() => excluirTarefa(t.id, t.titulo)} title="Excluir" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>🗑️</button>
                                )}
                              </div>
                            </div>

                          </div>

                          {/* SUB-TAREFAS E BOTÃO "+ Adicionar nova" */}
                          {isExpandido && (
                            <div style={{ background: theme.cardInner, padding: '4px 16px 8px 40px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                              <div style={{ position: 'absolute', left: '26px', top: '0', bottom: '10px', width: '2px', background: theme.treeLine }}></div>
                              
                              {subTarefas.map((sub) => (
                                <div key={sub.id} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr 1fr', alignItems: 'center', fontSize: '12px', position: 'relative', padding: '4px 0' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ position: 'absolute', left: '-14px', top: '50%', width: '12px', height: '2px', background: theme.treeLine }}></div>
                                    <input type="checkbox" checked={sub.concluida} onChange={() => alternarStatusSubPendencia(t.id, sub.id)} style={{ accentColor: '#2eaadc', cursor: 'pointer' }} />
                                    <span style={{ color: sub.concluida ? theme.textMuted : theme.textMain, textDecoration: sub.concluida ? 'line-through' : 'none' }}>📄 {sub.texto}</span>
                                  </div>
                                  <div style={{ color: theme.textMuted, fontSize: '11px' }}>{t.responsavel}</div>
                                  <div style={{ color: theme.textMuted, fontSize: '11px' }}>📄 {t.titulo}</div>
                                  <div style={{ color: theme.textMuted, fontSize: '11px' }}>Agora há pouco</div>
                                  <div style={{ textAlign: 'right' }}>
                                    <button onClick={() => excluirSubPendencia(t.id, sub.id)} style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '10px' }}>Excluir</button>
                                  </div>
                                </div>
                              ))}

                              <div 
                                onClick={() => adicionarSubPendenciaRapida(t.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textMuted, cursor: 'pointer', padding: '4px 0', marginTop: '2px' }}
                              >
                                <span>+</span> <span style={{ fontWeight: '500' }}>Adicionar nova</span>
                              </div>

                            </div>
                          )}

                        </React.Fragment>
                      );
                    })}

                  </div>
                )}

              </div>

            </div>
          </>
        )}

      </div>

      {tarefaEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '6px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '16px', fontWeight: '600', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>✏️ Editar Página</h3>
            <form onSubmit={salvarEdicaoTarefa}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Título *</label>
                <input type="text" value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} required style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Fonte / Descrição</label>
                <textarea rows="3" value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setTarefaEditando(null)} style={{ flex: 1, padding: '8px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '8px', background: '#37352f', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tarefaResolvendo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '6px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#27ae60', fontSize: '16px', fontWeight: '600' }}>✔ Concluir Página</h3>
            <form onSubmit={confirmarResolucaoTarefa}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.textMuted, marginBottom: '4px' }}>Detalhes da Conclusão *</label>
                <textarea rows="3" placeholder="Relato..." value={detalhesResolucaoInput} onChange={(e) => setDetalhesResolucaoInput(e.target.value)} required style={{ width: '100%', padding: '8px 10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setTarefaResolvendo(null)} style={{ flex: 1, padding: '8px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: '8px', background: '#27ae60', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

function TelaLogin({ onLoginSucesso, darkMode, setDarkMode, theme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    try {
      const result = await signInWithEmailAndPassword(auth, email, senha);
      onLoginSucesso(result.user.email);
    } catch (e) {
      setErro(`Erro ao entrar: Verifique seu e-mail e senha.`);
    }
  };

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box', padding: '20px', position: 'relative' }}>
      <button type="button" onClick={setDarkMode} style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <form onSubmit={handleLogin} style={{ background: theme.cardBg, padding: '32px 24px', borderRadius: '6px', width: '100%', maxWidth: '360px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: theme.textMain, fontWeight: 'bold', display: 'block' }}>Sistema Integrado</span>
          <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500', display: 'block' }}>NOC • NMR • NIIP</span>
        </div>

        {erro && <p style={{ color: '#eb5757', fontSize: '12px', marginBottom: '14px', background: darkMode ? '#3b1c1c' : '#fde8e8', padding: '8px', borderRadius: '4px' }}>{erro}</p>}
          
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '4px', color: theme.textMuted }}>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@fibralink.net.br" style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', marginBottom: '4px', color: theme.textMuted }}>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
        </div>

        <button type="submit" style={{ width: '100%', padding: '10px', background: '#37352f', border: 'none', color: '#fff', fontWeight: '500', borderRadius: '4px', cursor: 'pointer', marginBottom: '12px', fontSize: '13px' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}

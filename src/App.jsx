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

// Inserção dinâmica segura do Favicon
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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Erro capturado:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#191919', color: '#eb5757', fontFamily: 'sans-serif', minHeight: '100vh', boxSizing: 'border-box' }}>
          <h2>Ocorreu um erro ao carregar a aplicação.</h2>
          <pre style={{ background: '#262626', padding: '15px', borderRadius: '5px', overflowX: 'auto', color: '#dbdbd7' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
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

  const [paginaLateral, setPaginaLateral] = useState(null); 
  const [editTituloLateral, setEditTituloLateral] = useState('');
  const [editDescricaoLateral, setEditDescricaoLateral] = useState('');

  const [editandoId, setEditandoId] = useState(null);
  const [textoEditando, setTextoEditando] = useState('');

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

  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ view: 'andamento' }, '');
    }

    const handlePopState = (e) => {
      setPaginaLateral(null);
      if (e.state && e.state.view) {
        setPaginaAtual(e.state.view);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const abrirPainelLateral = (t) => {
    setPaginaLateral(t);
    setEditTituloLateral(t.titulo);
    setEditDescricaoLateral(t.descricao || '');
    window.history.pushState({ view: paginaAtual, lateralAberta: true }, '');
  };

  const fecharPainelLateral = () => {
    setPaginaLateral(null);
    window.history.back();
  };

  const mudarPagina = (novaPagina) => {
    setPaginaLateral(null);
    setPaginaAtual(novaPagina);
    window.history.pushState({ view: novaPagina }, '');
  };

  const mudarSetor = (novoSetor) => {
    setPaginaLateral(null);
    setSetorSelecionado(novoSetor);
    setPaginaAtual('andamento');
    window.history.pushState({ view: 'andamento' }, '');
  };

  useEffect(() => {
    try {
      if (!auth) {
        setLoadingAuth(false);
        return;
      }
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        try {
          if (user && user.email) {
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
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingAuth(false);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      setLoadingAuth(false);
    }
  }, []);

  const nomeFormatadoGlobal = usuarioLogado ? usuarioLogado.split('@')[0].replace('.', ' ').toUpperCase() : '';
  const isGestor = nomeFormatadoGlobal.includes('DUANDYS');

  const emailLowerGlobal = usuarioLogado ? usuarioLogado.toLowerCase() : '';
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

  let nomeForcadoParaUsuario = null;
  if (emailLowerGlobal.includes('joao') || emailLowerGlobal.includes('joão') || nomeFormatadoGlobal.includes('JOAO') || nomeFormatadoGlobal.includes('JOÃO')) {
    nomeForcadoParaUsuario = 'João';
  }

  useEffect(() => {
    if (usuarioLogado && setorSelecionado && db) {
      try {
        const unsub = onSnapshot(collection(db, `${setorSelecionado}_tarefas`), (snapshot) => {
          const lista = [];
          snapshot.forEach((docSnap) => {
            lista.push({ id: docSnap.id, ...docSnap.data() });
          });
          lista.sort((a, b) => b.criadoEm - a.criadoEm);
          setTarefas(lista);

          if (paginaLateral) {
            const atualizada = lista.find(t => t.id === paginaLateral.id);
            if (atualizada) setPaginaLateral(atualizada);
          }

          if (!popupJaExibido) {
            const minhasUrgentes = lista.filter(t => {
              if (t.status === 'Resolvida') return false;
              const isMeu = nomeFormatadoGlobal.includes((t.responsavel || '').toUpperCase());
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
        }, (err) => console.error(err));

        const unsubLogs = onSnapshot(collection(db, `${setorSelecionado}_auditoria`), (snapshot) => {
          const logsLista = [];
          snapshot.forEach((docSnap) => {
            logsLista.push({ id: docSnap.id, ...docSnap.data() });
          });
          logsLista.sort((a, b) => b.timestamp - a.timestamp);
          setLogsAuditoria(logsLista);
        }, (err) => console.error(err));

        return () => {
          unsub();
          unsubLogs();
        };
      } catch (e) {}
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
      if (!db || !setorSelecionado) return;
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
  const responsavelFinal = isGestor ? responsavelSelecionadoGestor : nomeForcadoParaUsuario || (integrantesAtuais.find(n => nomeFormatadoGlobal.includes(n.toUpperCase())) || integrantesAtuais[0] || 'Gestor');

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
        concluida: false,
        subTarefas: []
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

  // Função recursiva para adicionar subtarefa em qualquer nível (tarefa pai ou subtarefa filha)
  const adicionarSubPendenciaRecursiva = async (tarefaRaizId, caminhoAlvoIds, novoTexto) => {
    try {
      const tarefaRaiz = tarefas.find(t => t.id === tarefaRaizId);
      if (!tarefaRaiz) return;

      const novaSub = {
        id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 5),
        texto: novoTexto.trim(),
        concluida: false,
        subTarefas: []
      };

      const inserirNaArvore = (lista) => {
        return lista.map(item => {
          if (item.id === caminhoAlvoIds[0]) {
            if (caminhoAlvoIds.length === 1) {
              return { ...item, subTarefas: [...(item.subTarefas || []), novaSub] };
            } else {
              return { ...item, subTarefas: inserirNaArvore(item.subTarefas || [], caminhoAlvoIds.slice(1)) };
            }
          }
          return item;
        });
      };

      // Se o caminho for apenas o ID raiz
      let novaListaSub;
      if (caminhoAlvoIds.length === 1) {
        novaListaSub = [...(tarefaRaiz.subTarefas || []), novaSub];
      } else {
        novaListaSub = inserirNaArvore(tarefaRaiz.subTarefas || [], caminhoAlvoIds.slice(1));
      }

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaRaizId), {
        subTarefas: caminhoAlvoIds.length === 1 ? [...(tarefaRaiz.subTarefas || []), novaSub] : inserirNaArvore(tarefaRaiz.subTarefas, caminhoAlvoIds)
      });

      setExpandidoIds(prev => ({ ...prev, [caminhoAlvoIds[caminhoAlvoIds.length - 1]]: true }));
    } catch (e) {
      alert("Erro ao adicionar subtarefa: " + e.message);
    }
  };

  const promptAdicionarSub = (tarefaRaizId, caminhoIds) => {
    const subTexto = prompt("Digite o título da nova subtarefa:");
    if (!subTexto || !subTexto.trim()) return;
    adicionarSubPendenciaRecursiva(tarefaRaizId, caminhoIds, subTexto.trim());
  };

  // Função recursiva para alternar status de conclusão
  const alternarStatusRecursivo = async (tarefaRaizId, caminhoIds) => {
    try {
      const tarefaRaiz = tarefas.find(t => t.id === tarefaRaizId);
      if (!tarefaRaiz) return;

      const atualizarArvore = (lista, ids) => {
        return lista.map(item => {
          if (item.id === ids[0]) {
            if (ids.length === 1) {
              return { ...item, concluida: !item.concluida };
            } else {
              return { ...item, subTarefas: atualizarArvore(item.subTarefas || [], ids.slice(1)) };
            }
          }
          return item;
        });
      };

      const novaSubTarefas = atualizarArvore(tarefaRaiz.subTarefas || [], caminhoIds);

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaRaizId), {
        subTarefas: novaSubTarefas
      });
    } catch (e) {}
  };

  // Função recursiva para excluir subtarefa
  const excluirSubRecursivo = async (tarefaRaizId, caminhoIds) => {
    if (!window.confirm("Deseja realmente excluir esta subtarefa?")) return;
    try {
      const tarefaRaiz = tarefas.find(t => t.id === tarefaRaizId);
      if (!tarefaRaiz) return;

      const excluirDaArvore = (lista, ids) => {
        if (ids.length === 1) {
          return lista.filter(item => item.id !== ids[0]);
        }
        return lista.map(item => {
          if (item.id === ids[0]) {
            return { ...item, subTarefas: excluirDaArvore(item.subTarefas || [], ids.slice(1)) };
          }
          return item;
        });
      };

      const novaSubTarefas = excluirDaArvore(tarefaRaiz.subTarefas || [], caminhoIds);

      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaRaizId), {
        subTarefas: novaSubTarefas
      });
    } catch (e) {}
  };

  const salvarEdicaoInlineTarefa = async (tarefaId, novoTitulo) => {
    if (!novoTitulo.trim()) return;
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaId), {
        titulo: novoTitulo.trim()
      });
      setEditandoId(null);
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
      if (paginaLateral && paginaLateral.id === tarefaResolvendo.id) fecharPainelLateral();
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
        if (paginaLateral && paginaLateral.id === id) fecharPainelLateral();
      } catch (err) {}
    }
  };

  const salvarAlteracoesPaginaLateral = async () => {
    if (!paginaLateral || !editTituloLateral.trim()) return;
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, paginaLateral.id), {
        titulo: editTituloLateral.trim(),
        descricao: editDescricaoLateral.trim()
      });
      setPaginaLateral(prev => ({ ...prev, titulo: editTituloLateral.trim(), descricao: editDescricaoLateral.trim() }));
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

  // Componente recursivo para renderizar subtarefas em qualquer nível com seta e botão adicionar nova
  const renderizarSubTarefasRecursivas = (subLista, tarefaRaizId, caminhoPai, nivel = 1) => {
    if (!subLista || subLista.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: theme.cardInner, borderTop: `1px solid ${theme.border}` }}>
        {subLista.map((sub) => {
          const caminhoAtual = [...caminhoPai, sub.id];
          const isExpandidoSub = expandidoIds[sub.id];
          const temFilhos = sub.subTarefas && sub.subTarefas.length > 0;
          const paddingLeftPx = nivel * 24 + 6;

          return (
            <React.Fragment key={sub.id}>
              <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', padding: `8px 0 8px ${paddingLeftPx}px`, alignItems: 'center', fontSize: '13px', borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <span onClick={() => alternarExpandido(sub.id)} style={{ cursor: 'pointer', fontSize: '10px', color: theme.textMuted, userSelect: 'none', padding: '2px', width: '12px', textAlign: 'center' }}>
                    {temFilhos ? (isExpandidoSub ? '▼' : '▶') : ''}
                  </span>
                  <input type="checkbox" checked={sub.concluida} onChange={() => alternarStatusRecursivo(tarefaRaizId, caminhoAtual)} style={{ accentColor: '#2eaadc', cursor: 'pointer' }} />
                  <span>📄</span>
                  <span style={{ color: sub.concluida ? theme.textMuted : theme.textMain, textDecoration: sub.concluida ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub.texto}</span>
                </div>
                <div style={{ color: theme.textMuted, fontSize: '13px' }}>{tarefas.find(t => t.id === tarefaRaizId)?.responsavel}</div>
                <div style={{ color: theme.textMuted, fontSize: '13px' }}>📄 Sub-tarefa</div>
                <div style={{ color: theme.textMuted, fontSize: '13px' }}>Agora há pouco</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted, fontSize: '13px', paddingRight: '10px' }}>
                  <span>Agora há pouco</span>
                  <button onClick={() => excluirSubRecursivo(tarefaRaizId, caminhoAtual)} style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '11px' }}>Excluir</button>
                </div>
              </div>

              {/* Se expandido, renderiza os filhos recursivamente e o botão adicionar nova */}
              {isExpandidoSub && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {renderizarSubTarefasRecursivas(sub.subTarefas, tarefaRaizId, caminhoAtual, nivel + 1)}
                  <div 
                    onClick={() => promptAdicionarSub(tarefaRaizId, caminhoAtual)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted, cursor: 'pointer', padding: `8px 0 8px ${paddingLeftPx + 30}px`, borderTop: `1px solid ${theme.border}`, fontWeight: '500' }}
                  >
                    <span>+</span> <span>Adicionar nova</span>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  if (loadingAuth) {
    return (
      <div style={{ color: '#dbdbd7', backgroundColor: '#191919', textAlign: 'center', marginTop: '40vh', fontFamily: 'sans-serif', minHeight: '100vh', fontSize: '14px' }}>
        Carregando workspace...
      </div>
    );
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
      <div className="sidebar-notion" style={{ width: '240px', background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '12px 8px', boxSizing: 'border-box', flexShrink: '0' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', marginBottom: '16px', background: theme.cardBg, border: `1px solid ${theme.border}` }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2eaadc', color: '#fff', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {nomeFormatadoGlobal.charAt(0) || 'J'}
          </div>
          <span style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Espaço de {nomeFormatadoGlobal || 'Usuário'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px', marginBottom: '16px' }}>
          <div onClick={() => mudarPagina('andamento')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: !paginaLateral && paginaAtual === 'andamento' ? theme.cardInner : 'transparent' }}>
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
              onClick={() => abrirPainelLateral(t)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', background: paginaLateral?.id === t.id ? theme.cardInner : 'transparent', color: paginaLateral?.id === t.id ? theme.textMain : theme.textMuted }}
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

      {/* ÁREA PRINCIPAL SPLIT-VIEW */}
      <div style={{ flex: 1, display: 'flex', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        
        {/* CONTEÚDO DA BIBLIOTECA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 48px', boxSizing: 'border-box', overflowY: 'auto' }}>
          
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

          {/* CABEÇALHO E BOTÃO NOVA PÁGINA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: theme.textMain }}>Biblioteca</h1>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={alternarTema} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                {darkMode ? '☀️ Claro' : '🌙 Escuro'}
              </button>
              <button 
                onClick={() => {
                  const nome = prompt("Digite o título da nova página:");
                  if (nome) {
                    setTitulo(nome);
                    setPrazo(new Date().toISOString().split('T')[0]);
                    setTimeout(() => {
                      const novaId = Date.now().toString();
                      setDoc(doc(db, `${setorSelecionado || 'niip'}_tarefas`, novaId), {
                        titulo: nome.trim(),
                        descricao: 'Particular',
                        responsavel: responsavelFinal,
                        prazo: new Date().toISOString().split('T')[0],
                        prioridade: 'Média',
                        status: 'Pendente',
                        criadoPor: nomeFormatadoGlobal,
                        criadoEm: Date.now(),
                        subTarefas: []
                      });
                    }, 100);
                  }
                }}
                style={{ background: '#2383e2', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: '500', fontSize: '13px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
              >
                Nova página
              </button>
            </div>
          </div>

          {/* ABAS SUPERIORES */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px', marginBottom: '20px', fontSize: '13px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', color: theme.textMuted }}>
              <span style={{ fontWeight: '500', color: theme.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>🕒 Recentes</span>
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>⭐ Favoritos</span>
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>👥 Compartilhado</span>
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🔒 Particular</span>
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🎙️ Anotações IA</span>
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>⚡ Habilidades</span>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: theme.textMuted }}>
              <span style={{ cursor: 'pointer' }}>☰</span>
              <span style={{ cursor: 'pointer' }}>🔍</span>
              <span style={{ cursor: 'pointer' }}>⚙️</span>
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '4px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
                <option value="todos">Responsável: Todos</option>
                {integrantesAtuais.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* TABELA DE DADOS ESTILO NOTION */}
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', padding: '8px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '12px', fontWeight: '500', color: theme.textMuted, minWidth: '700px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📄 Nome da página</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>👤 Criado por</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📑 Fonte</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🕒 Última edição</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🕒 Última visita em</div>
            </div>

            {tarefasFiltradas.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Nenhuma página encontrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '700px' }}>
                {tarefasFiltradas.map(t => {
                  const subTarefas = t.subTarefas || [];
                  const isExpandido = expandidoIds[t.id];

                  return (
                    <React.Fragment key={t.id}>
                      {/* LINHA PRINCIPAL DA PÁGINA PAI */}
                      <div 
                        onDoubleClick={() => { setEditandoId(t.id); setTextoEditando(t.titulo); }}
                        style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', padding: '10px 0', borderBottom: `1px solid ${theme.border}`, alignItems: 'center', fontSize: '13px', transition: 'background 0.1s' }} 
                        onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner} 
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', paddingRight: '10px' }}>
                          <span onClick={() => alternarExpandido(t.id)} style={{ cursor: 'pointer', fontSize: '10px', color: theme.textMuted, userSelect: 'none', padding: '2px', width: '12px', textAlign: 'center' }}>
                            {isExpandido ? '▼' : '▶'}
                          </span>
                          <span>📄</span>
                          {editandoId === t.id ? (
                            <input 
                              type="text" 
                              value={textoEditando}
                              autoFocus
                              onChange={(e) => setTextoEditando(e.target.value)}
                              onBlur={() => salvarEdicaoInlineTarefa(t.id, textoEditando)}
                              onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicaoInlineTarefa(t.id, textoEditando); }}
                              style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, padding: '2px 6px', fontSize: '13px', borderRadius: '3px', width: '80%' }}
                            />
                          ) : (
                            <span 
                              onClick={() => abrirPainelLateral(t)}
                              style={{ fontWeight: '400', color: theme.textMain, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {t.titulo}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.textMain, fontSize: '13px' }}>
                          <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#787774', color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>J</span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.responsavel}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.textMain, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span>🔒</span> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.descricao || 'Particular'}</span>
                        </div>

                        <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                          Agora há pouco
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: theme.textMuted, fontSize: '13px', paddingRight: '10px' }}>
                          <span>Agora há pouco</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => abrirModalEdicao(t)} title="Editar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                            <button onClick={() => abrirModalResolucao(t)} title="Concluir" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>✔</button>
                            {isGestor && (
                              <button onClick={() => excluirTarefa(t.id, t.titulo)} title="Excluir" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '11px' }}>🗑️</button>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* SUB-PÁGINAS RECURSIVAS E BOTÃO "+ Adicionar nova" */}
                      {isExpandido && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {renderizarSubTarefasRecursivas(subTarefas, t.id, [t.id], 1)}
                          <div 
                            onClick={() => promptAdicionarSub(t.id, [t.id])}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted, cursor: 'pointer', padding: '10px 0 10px 30px', borderTop: `1px solid ${theme.border}`, fontWeight: '500', background: theme.cardInner }}
                          >
                            <span>+</span> <span>Adicionar nova</span>
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

        {/* PAINEL LATERAL DIREITO (SPLIT-VIEW) */}
        {paginaLateral && (
          <div style={{ width: '450px', background: theme.cardBg, borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '32px', boxSizing: 'border-box', height: '100vh', overflowY: 'auto', flexShrink: '0', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>
                Biblioteca / {paginaLateral.titulo}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => abrirModalResolucao(paginaLateral)} title="Concluir" style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✔ Concluir</button>
                <button onClick={fecharPainelLateral} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕ Fechar</button>
              </div>
            </div>

            <input 
              type="text" 
              value={editTituloLateral} 
              onChange={(e) => setEditTituloLateral(e.target.value)}
              onBlur={salvarAlteracoesPaginaLateral}
              style={{ fontSize: '28px', fontWeight: '700', color: theme.textMain, background: 'transparent', border: 'none', outline: 'none', width: '100%', marginBottom: '20px' }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textMuted }}>
                <span>Atribuído a:</span>
                <strong style={{ color: theme.textMain }}>{paginaLateral.responsavel}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textMuted }}>
                <span>Prazo:</span>
                <strong style={{ color: theme.textMain }}>{formatarDataParaBr(paginaLateral.prazo)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textMuted }}>
                <span>Prioridade:</span>
                <strong style={{ color: theme.textMain }}>{paginaLateral.prioridade}</strong>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500' }}>Conteúdo / Bloco de Notas</label>
              <textarea 
                rows="10"
                value={editDescricaoLateral}
                onChange={(e) => setEditDescricaoLateral(e.target.value)}
                onBlur={salvarAlteracoesPaginaLateral}
                placeholder="Clique na barra de espaço para ativar a IA ou '/' para acessar os comandos..."
                style={{ width: '100%', padding: '12px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', fontSize: '13px', resize: 'vertical', lineHeight: '1.6' }}
              />
            </div>

          </div>
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

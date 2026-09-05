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
  
  /* RESPONSIVIDADE PARA CELULARES */
  .table-responsive-wrapper {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  @media (max-width: 768px) {
    .workspace-layout {
      flex-direction: column !important;
    }
    .sidebar-notion {
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
    }
    .main-content-area {
      padding: 16px !important;
    }
    .lateral-panel {
      width: 100% !important;
      position: fixed !important;
      top: 0;
      left: 0;
      z-index: 1000;
      height: 100vh !important;
    }
  }
`;
document.head.appendChild(style);

const formatarDataParaBr = (dataStr) => {
  if (!dataStr) return '';
  try {
    const parts = dataStr.split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return dataStr;
  } catch (e) {
    return dataStr;
  }
};

const tempoDecorrido = (timestamp) => {
  if (!timestamp) return 'Agora há pouco';
  const agora = Date.now();
  const diffMs = agora - timestamp;
  const diffSeg = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSeg / 60);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffSeg < 60) return 'Há poucos segundos';
  if (diffMin < 60) return 'Há ' + diffMin + ' minuto' + (diffMin > 1 ? 's' : '');
  if (diffHoras < 24) return 'Há ' + diffHoras + ' hora' + (diffHoras > 1 ? 's' : '');
  if (diffDias < 30) return 'Há ' + diffDias + ' dia' + (diffDias > 1 ? 's' : '');
  const diffMeses = Math.floor(diffDias / 30);
  if (diffMeses < 12) return 'Há ' + diffMeses + ' mês' + (diffMeses > 1 ? 'es' : '');
  const diffAnos = Math.floor(diffDias / 365);
  return 'Há ' + diffAnos + ' ano' + (diffAnos > 1 ? 's' : '');
};

const GRUPOS_MEMBROS = {
  noc: ["ESTEVAN", "STEVAN", "GILVAN", "GUSTAVO", "JOAO", "LUCAS", "KESSY", "TOLENTINO"],
  niip: ["FRANCISCO", "GABRIEL", "WALGNEY"],
  nmr: ["DHENNIFER"]
};

const TODOS_INTEGRANTES = ["Dhennifer", "Duandys", "Francisco", "Gabriel", "Gilvan", "Gustavo", "João", "Kessy", "Lucas", "Stevan", "Tolentino", "Walgney"];

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
          <pre style={{ background: '#262626', padding: '15px', borderRadius: '5px', overflowX: 'auto', color: '#f4f4f0' }}>
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
  const [responsavelSelecionadoGestor, setResponsavelSelecionadoGestor] = useState(TODOS_INTEGRANTES[0]);
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');
  const [filtroPalavraChave, setFiltroPalavraChave] = useState('');

  const [paginaLateral, setPaginaLateral] = useState(null); 
  const [editTituloLateral, setEditTituloLateral] = useState('');
  const [editDescricaoLateral, setEditDescricaoLateral] = useState('');

  const [editandoId, setEditandoId] = useState(null);
  const [textoEditando, setTextoEditando] = useState('');

  // Estados para Modal de Nova Página Principal
  const [modalNovaPagina, setModalNovaPagina] = useState(false);
  const [novoTituloModal, setNovoTituloModal] = useState('');
  const [novaPrioridadeModal, setNovaPrioridadeModal] = useState('Baixa');
  const [novosGruposModal, setNovosGruposModal] = useState({
    Particular: true,
    NOC: false,
    NIIP: false,
    NMR: false
  });

  // Estados para Modal de Subtarefa
  const [modalNovaSub, setModalNovaSub] = useState({ isOpen: false, tarefaRaizId: null, caminhoIds: null });
  const [subTituloModal, setSubTituloModal] = useState('');
  const [subPrioridadeModal, setSubPrioridadeModal] = useState('Baixa');
  const [subGruposModal, setSubGruposModal] = useState({
    Particular: true,
    NOC: false,
    NIIP: false,
    NMR: false
  });

  // Estado para Modal de Edição de Grupos da Fonte
  const [modalEditarGruposFonte, setModalEditarGruposFonte] = useState({
    isOpen: false,
    isSub: false,
    tarefaId: null,
    caminhoIds: null,
    gruposAtuais: {}
  });

  // Estado para Modal de Edição de Prioridade via Pop-up
  const [modalEditarPrioridade, setModalEditarPrioridade] = useState({
    isOpen: false,
    isSub: false,
    tarefaId: null,
    caminhoIds: null,
    prioridadeAtual: 'Baixa'
  });

  // Estado para Exclusão
  const [modalExclusao, setModalExclusao] = useState({ isOpen: false, tipo: null, tarefa: null, caminhoIds: null });
  const [modalAlerta, setModalAlerta] = useState({ isOpen: false, titulo: '', mensagem: '' });

  const [expandidoIds, setExpandidoIds] = useState(() => {
    try {
      const salvo = localStorage.getItem('expandidoIds_fibralink');
      return salvo ? JSON.parse(salvo) : {};
    } catch (e) {
      return {};
    }
  });

  // Regra padrão: Abre expandido (true) por padrão
  const verificarExpandido = (id) => {
    if (expandidoIds[id] !== undefined) {
      return Boolean(expandidoIds[id]);
    }
    return true; 
  };

  const alternarExpandido = (id) => {
    setExpandidoIds(prev => {
      const atual = verificarExpandido(id);
      const novo = { ...prev, [id]: !atual };
      try {
        localStorage.setItem('expandidoIds_fibralink', JSON.stringify(novo));
      } catch (e) {}
      return novo;
    });
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
    setEditDescricaoLateral(t.blocoNotas || '');
    window.history.pushState({ view: paginaAtual, lateralAberta: true }, '');
  };

  const abrirPainelLateralSub = (sub, raizId, caminhoIds, tarefaPai) => {
    const subObj = {
      isSub: true,
      raizId,
      caminhoIds,
      id: sub.id,
      titulo: sub.texto,
      blocoNotas: sub.blocoNotas || '',
      responsavel: tarefaPai.responsavel,
      concluida: Boolean(sub.concluida),
      arquivada: Boolean(sub.arquivada),
      excluido: Boolean(sub.excluido),
      criadoPor: sub.criadoPor || tarefaPai.criadoPor,
      editadoPor: sub.editadoPor,
      gruposSelecionados: sub.gruposSelecionados,
      _colecao: tarefaPai._colecao
    };
    setPaginaLateral(subObj);
    setEditTituloLateral(sub.texto);
    setEditDescricaoLateral(sub.blocoNotas || '');
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

  useEffect(() => {
    try {
      if (!auth) {
        setLoadingAuth(false);
        return;
      }
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        try {
          if (user && user.email) {
            setUsuarioLogado(user.email);
            const userUpper = user.email.split('@')[0].replace('.', ' ').toUpperCase();
            const match = TODOS_INTEGRANTES.find(n => userUpper.includes(n.toUpperCase()));
            if (match) {
              setResponsavelSelecionadoGestor(match);
            }
          } else {
            setUsuarioLogado(null);
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
  let nomeForcadoParaUsuario = null;
  if (emailLowerGlobal.includes('joao') || emailLowerGlobal.includes('joão') || nomeFormatadoGlobal.includes('JOAO') || nomeFormatadoGlobal.includes('JOÃO')) {
    nomeForcadoParaUsuario = 'João';
  }

  // Validação estrita de grupo: Apenas membros do grupo associado ou o Gestor (Duandys) podem interagir/concluir
  const verificarPermissaoNode = (nodeObj) => {
    if (isGestor) return true;

    const grupos = nodeObj.gruposSelecionados;
    if (!grupos) {
      return nodeObj.criadoPor && nodeObj.criadoPor.toUpperCase() === nomeFormatadoGlobal.toUpperCase();
    }

    let pertenceAoGrupo = false;
    if (grupos.NOC && GRUPOS_MEMBROS.noc.includes(nomeFormatadoGlobal)) pertenceAoGrupo = true;
    if (grupos.NIIP && GRUPOS_MEMBROS.niip.includes(nomeFormatadoGlobal)) pertenceAoGrupo = true;
    if (grupos.NMR && GRUPOS_MEMBROS.nmr.includes(nomeFormatadoGlobal)) pertenceAoGrupo = true;

    if (pertenceAoGrupo) return true;

    const temGruposEquipe = grupos.NOC || grupos.NIIP || grupos.NMR;
    if (grupos.Particular && !temGruposEquipe) {
      return nodeObj.criadoPor && nodeObj.criadoPor.toUpperCase() === nomeFormatadoGlobal.toUpperCase();
    }

    return false;
  };

  const usuarioTemPermissaoTarefa = (tarefaObj) => {
    return verificarPermissaoNode(tarefaObj);
  };

  useEffect(() => {
    if (usuarioLogado && db) {
      try {
        const colecoes = ['tarefas_gerais', 'niip_tarefas', 'noc_tarefas', 'nmr_tarefas'];
        const dadosPorColecao = {};

        const unsubscribers = colecoes.map(colName => {
          return onSnapshot(collection(db, colName), (snapshot) => {
            const lista = [];
            snapshot.forEach((docSnap) => {
              lista.push({ id: docSnap.id, ...docSnap.data(), _colecao: colName });
            });
            dadosPorColecao[colName] = lista;

            const mapUnificado = new Map();
            Object.values(dadosPorColecao).forEach(arr => {
              if (arr) {
                arr.forEach(t => mapUnificado.set(t.id, t));
              }
            });

            const combinadas = Array.from(mapUnificado.values());
            combinadas.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
            setTarefas(combinadas);

            if (paginaLateral) {
              const atualizada = combinadas.find(t => t.id === paginaLateral.id);
              if (atualizada) setPaginaLateral(atualizada);
            }
          }, (err) => console.error(err));
        });

        return () => {
          unsubscribers.forEach(unsub => unsub());
        };
      } catch (e) {}
    }
  }, [usuarioLogado]);

  const responsavelFinal = isGestor ? responsavelSelecionadoGestor : nomeForcadoParaUsuario || (TODOS_INTEGRANTES.find(n => nomeFormatadoGlobal.includes(n.toUpperCase())) || TODOS_INTEGRANTES[0]);

  const formatarFonteGrupos = (objGrupos) => {
    const selecionados = Object.keys(objGrupos).filter(k => objGrupos[k]);
    if (selecionados.length === 0) return 'Particular';
    if (selecionados.length === 1) {
      return selecionados[0] === 'Particular' ? 'Particular' : 'Grupo: ' + selecionados[0];
    }
    return 'Grupos: ' + selecionados.join(', ');
  };

  const confirmarCriacaoNovaPagina = () => {
    if (!novoTituloModal.trim()) {
      alert("Digite um título para a página.");
      return;
    }
    const novaId = Date.now().toString();
    const dataHoje = new Date().toISOString().split('T')[0];
    
    let colecaoAlvo = 'tarefas_gerais';
    if (novosGruposModal.NOC) colecaoAlvo = 'noc_tarefas';
    else if (novosGruposModal.NIIP) colecaoAlvo = 'niip_tarefas';
    else if (novosGruposModal.NMR) colecaoAlvo = 'nmr_tarefas';

    setDoc(doc(db, colecaoAlvo, novaId), {
      titulo: novoTituloModal.trim(),
      fonteGrupos: formatarFonteGrupos(novosGruposModal),
      blocoNotas: '',
      gruposSelecionados: novosGruposModal,
      responsavel: responsavelFinal,
      prazo: dataHoje,
      prioridade: novaPrioridadeModal,
      status: 'Pendente',
      arquivada: false,
      excluido: false,
      criadoPor: nomeFormatadoGlobal || 'Usuário',
      criadoEm: Date.now(),
      subTarefas: []
    }).then(() => {
      setModalNovaPagina(false);
      setNovoTituloModal('');
      setNovaPrioridadeModal('Baixa');
      setNovosGruposModal({ Particular: true, NOC: false, NIIP: false, NMR: false });
    }).catch(e => alert("Erro ao criar página: " + e.message));
  };

  const confirmarCriacaoSubtarefa = () => {
    if (!subTituloModal.trim()) {
      alert("Digite o título da subtarefa.");
      return;
    }
    const { tarefaRaizId, caminhoIds } = modalNovaSub;
    const tarefaRaiz = tarefas.find(t => t.id === tarefaRaizId);
    if (!tarefaRaiz) return;

    if (!usuarioTemPermissaoTarefa(tarefaRaiz)) {
      alert("Acesso negado: Você não tem permissão para adicionar subtarefas nesta página!");
      return;
    }

    const novaSub = {
      id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 5),
      texto: subTituloModal.trim(),
      prioridade: subPrioridadeModal,
      fonteGrupos: formatarFonteGrupos(subGruposModal),
      blocoNotas: '',
      criadoEm: Date.now(),
      gruposSelecionados: subGruposModal,
      concluida: false,
      arquivada: false,
      excluido: false,
      criadoPor: nomeFormatadoGlobal || 'Usuário',
      subTarefas: []
    };

    const subTarefasComNova = insertNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds, novaSub);
    const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';

    updateDoc(doc(db, colecaoAlvo, tarefaRaizId), {
      subTarefas: subTarefasComNova
    }).then(() => {
      setExpandidoIds(prev => {
        const targetId = caminhoIds.length > 0 ? caminhoIds[caminhoIds.length - 1] : tarefaRaizId;
        const novo = { ...prev, [targetId]: true };
        try { localStorage.setItem('expandidoIds_fibralink', JSON.stringify(novo)); } catch(e){}
        return novo;
      });
      setModalNovaSub({ isOpen: false, tarefaRaizId: null, caminhoIds: null });
      setSubTituloModal('');
      setSubPrioridadeModal('Baixa');
      setSubGruposModal({ Particular: true, NOC: false, NIIP: false, NMR: false });
    }).catch(e => alert("Erro ao adicionar subtarefa: " + e.message));
  };

  const salvarEdicaoGruposFonte = async (novosGrupos) => {
    const { isSub, tarefaId, caminhoIds } = modalEditarGruposFonte;
    const tarefaObj = tarefas.find(t => t.id === tarefaId);
    if (!tarefaObj) return;

    const colecaoAlvo = tarefaObj._colecao || 'tarefas_gerais';

    try {
      if (isSub) {
        const atualizarGruposSubNaArvore = (lista, ids) => {
          return (lista || []).map(item => {
            if (item.id === ids[0]) {
              if (ids.length === 1) {
                if (!verificarPermissaoNode(item) && !isGestor) {
                  throw new Error("Acesso negado: Você não tem permissão para editar esta subtarefa!");
                }
                const novaFonteStr = formatarFonteGrupos(novosGrupos);
                return { ...item, gruposSelecionados: novosGrupos, fonteGrupos: novaFonteStr };
              } else {
                return { ...item, subTarefas: atualizarGruposSubNaArvore(item.subTarefas || [], ids.slice(1)) };
              }
            }
            return item;
          });
        };

        const subTarefasAtualizadas = atualizarGruposSubNaArvore(tarefaObj.subTarefas || [], caminhoIds);
        await updateDoc(doc(db, colecaoAlvo, tarefaId), { subTarefas: subTarefasAtualizadas });
      } else {
        if (!verificarPermissaoNode(tarefaObj) && !isGestor) {
          throw new Error("Acesso negado: Você não tem permissão para editar esta tarefa!");
        }
        const novaFonteStr = formatarFonteGrupos(novosGrupos);
        await updateDoc(doc(db, colecaoAlvo, tarefaId), {
          gruposSelecionados: novosGrupos,
          fonteGrupos: novaFonteStr
        });
      }
      setModalEditarGruposFonte({ isOpen: false, isSub: false, tarefaId: null, caminhoIds: null, gruposAtuais: {} });
    } catch (e) {
      alert("Erro: " + e.message);
    }
  };

  const salvarEdicaoPrioridade = async (novaPrio) => {
    const { isSub, tarefaId, caminhoIds } = modalEditarPrioridade;
    const tarefaObj = tarefas.find(t => t.id === tarefaId);
    if (!tarefaObj) return;

    const colecaoAlvo = tarefaObj._colecao || 'tarefas_gerais';

    try {
      if (isSub) {
        const atualizarPrioridadeSubNaArvore = (lista, ids) => {
          return (lista || []).map(item => {
            if (item.id === ids[0]) {
              if (ids.length === 1) {
                if (!verificarPermissaoNode(item) && !isGestor) {
                  throw new Error("Acesso negado: Você não tem permissão para alterar a prioridade desta subtarefa!");
                }
                return { ...item, prioridade: novaPrio };
              } else {
                return { ...item, subTarefas: atualizarPrioridadeSubNaArvore(item.subTarefas || [], ids.slice(1)) };
              }
            }
            return item;
          });
        };

        const subTarefasAtualizadas = atualizarPrioridadeSubNaArvore(tarefaObj.subTarefas || [], caminhoIds);
        await updateDoc(doc(db, colecaoAlvo, tarefaId), { subTarefas: subTarefasAtualizadas });
      } else {
        if (!verificarPermissaoNode(tarefaObj) && !isGestor) {
          throw new Error("Acesso negado: Você não tem permissão para alterar a prioridade desta tarefa!");
        }
        await updateDoc(doc(db, colecaoAlvo, tarefaId), {
          prioridade: novaPrio
        });
      }
      setModalEditarPrioridade({ isOpen: false, isSub: false, tarefaId: null, caminhoIds: null, prioridadeAtual: 'Baixa' });
      alert("Prioridade atualizada com sucesso!");
    } catch (e) {
      alert("Erro: " + e.message);
    }
  };

  const setTrashRecursiveProp = (lista, val) => {
    return (lista || []).map(item => ({
      ...item,
      excluido: val,
      subTarefas: setTrashRecursiveProp(item.subTarefas, val)
    }));
  };

  const setArchiveRecursiveProp = (lista, val) => {
    return (lista || []).map(item => ({
      ...item,
      arquivada: val,
      subTarefas: setArchiveRecursiveProp(item.subTarefas, val)
    }));
  };

  const insertNodeInTree = (lista, ids, newNode) => {
    if (!ids || ids.length === 0) {
      return [...(lista || []), newNode];
    }
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          return {
            ...item,
            subTarefas: [...(item.subTarefas || []), newNode]
          };
        } else {
          return {
            ...item,
            subTarefas: insertNodeInTree(item.subTarefas || [], ids.slice(1), newNode)
          };
        }
      }
      return item;
    });
  };

  const toggleNodeInTree = (lista, ids) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          if (!verificarPermissaoNode(item) && !isGestor) {
            throw new Error("Acesso negado: Você não pertence ao grupo responsável por esta subtarefa!");
          }
          const novaConcluida = !Boolean(item.concluida);
          if (novaConcluida && item.subTarefas && item.subTarefas.length > 0) {
            if (!todasSubTarefasConcluidas(item.subTarefas)) {
              throw new Error("Você não pode concluir este item sem que todas as sub-subtarefas abaixo dele estejam concluídas primeiro!");
            }
          }
          return { ...item, concluida: novaConcluida };
        } else {
          return {
            ...item,
            subTarefas: toggleNodeInTree(item.subTarefas || [], ids.slice(1))
          };
        }
      }
      return item;
    });
  };

  const archiveNodeInTree = (lista, ids) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          return { ...item, arquivada: !Boolean(item.arquivada) };
        } else {
          return {
            ...item,
            subTarefas: archiveNodeInTree(item.subTarefas || [], ids.slice(1))
          };
        }
      }
      return item;
    });
  };

  const trashNodeInTree = (lista, ids) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          return { ...item, excluido: !Boolean(item.excluido) };
        } else {
          return {
            ...item,
            subTarefas: trashNodeInTree(item.subTarefas || [], ids.slice(1))
          };
        }
      }
      return item;
    });
  };

  const updateSubNoteInTree = (lista, ids, novaNota, editorName) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          if (!verificarPermissaoNode(item) && !isGestor) {
            throw new Error("Acesso negado: Você não pertence ao grupo desta subtarefa!");
          }
          const creator = item.criadoPor || '';
          const needsEditor = creator && creator.toUpperCase() !== editorName.toUpperCase();
          return { 
            ...item, 
            blocoNotas: novaNota, 
            ...(needsEditor && { editadoPor: editorName })
          };
        } else {
          return {
            ...item,
            subTarefas: updateSubNoteInTree(item.subTarefas || [], ids.slice(1), novaNota, editorName)
          };
        }
      }
      return item;
    });
  };

  const updateSubTextInTree = (lista, ids, newText, editorName) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          if (!verificarPermissaoNode(item) && !isGestor) {
            throw new Error("Acesso negado: Você não pertence ao grupo desta subtarefa!");
          }
          const creator = item.criadoPor || '';
          const needsEditor = creator && creator.toUpperCase() !== editorName.toUpperCase();
          return { 
            ...item, 
            texto: newText, 
            ...(needsEditor && { editadoPor: editorName })
          };
        } else {
          return {
            ...item,
            subTarefas: updateSubTextInTree(item.subTarefas || [], ids.slice(1), newText, editorName)
          };
        }
      }
      return item;
    });
  };

  const todasSubTarefasConcluidas = (subLista) => {
    if (!subLista || subLista.length === 0) return true;
    for (const sub of subLista) {
      if (!sub.excluido) {
        if (!sub.concluida) return false;
        if (sub.subTarefas && sub.subTarefas.length > 0) {
          if (!todasSubTarefasConcluidas(sub.subTarefas)) return false;
        }
      }
    }
    return true;
  };

  const alternarStatusTarefaPai = async (tarefa) => {
    if (!usuarioTemPermissaoTarefa(tarefa)) {
      setModalAlerta({ 
        isOpen: true, 
        titulo: 'Acesso Negado', 
        mensagem: 'Você não tem permissão para alterar o status desta tarefa pois ela não pertence ao seu grupo!' 
      });
      return;
    }

    const novoStatus = tarefa.status === 'Resolvida' ? 'Pendente' : 'Resolvida';

    if (novoStatus === 'Resolvida') {
      const todasProntas = todasSubTarefasConcluidas(tarefa.subTarefas);
      if (!todasProntas) {
        setModalAlerta({ 
          isOpen: true, 
          titulo: 'Ação Bloqueada', 
          mensagem: 'Você não pode concluir a tarefa pai sem que todas as subtarefas estejam concluídas primeiro!' 
        });
        return;
      }
    }

    try {
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        status: novoStatus
      });
    } catch (e) {
      setModalAlerta({ isOpen: true, titulo: 'Erro', mensagem: "Erro ao alterar status: " + e.message });
    }
  };

  const alternarStatusRecursivo = async (tarefaRaiz, caminhoIds) => {
    try {
      const subTarefasAtualizadas = toggleNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
      const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';

      await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
        subTarefas: subTarefasAtualizadas
      });
    } catch (e) {
      setModalAlerta({
        isOpen: true,
        titulo: 'Acesso Negado',
        mensagem: e.message || "Acesso negado: Você não tem permissão para alterar esta subtarefa!"
      });
    }
  };

  const arquivarTarefaPai = async (tarefa) => {
    if (!usuarioTemPermissaoTarefa(tarefa)) {
      setModalAlerta({ 
        isOpen: true, 
        titulo: 'Acesso Negado', 
        mensagem: 'Você não tem permissão para arquivar esta tarefa!' 
      });
      return;
    }
    const novaArquivada = !Boolean(tarefa.arquivada);
    
    if (novaArquivada) {
      if (!todasSubTarefasConcluidas(tarefa.subTarefas)) {
        setModalAlerta({ 
          isOpen: true, 
          titulo: 'Ação Bloqueada', 
          mensagem: 'Atenção: Só é permitido arquivar a tarefa se todas as subtarefas estiverem concluídas!' 
        });
        return;
      }
    }

    if (!window.confirm("Deseja realmente alterar o status de arquivamento desta página?")) return;
    try {
      const subTarefasAtualizadas = setArchiveRecursiveProp(tarefa.subTarefas, novaArquivada);
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        arquivada: novaArquivada,
        subTarefas: subTarefasAtualizadas
      });
      if (paginaLateral && paginaLateral.id === tarefa.id) fecharPainelLateral();
    } catch (e) {
      setModalAlerta({ isOpen: true, titulo: 'Erro', mensagem: "Erro ao arquivar: " + e.message });
    }
  };

  const tratarCliqueExcluirOuRestaurarPai = (tarefa) => {
    if (!isGestor) {
      alert("Apenas o gestor pode excluir tarefas.");
      return;
    }
    if (tarefa.excluido) {
      executarRestaurarDiretoPai(tarefa);
    } else {
      setModalExclusao({ isOpen: true, tipo: 'pai', tarefa, caminhoIds: null });
    }
  };

  const tratarCliqueExcluirOuRestaurarSub = (tarefaRaiz, caminhoIds, isSubExcluido) => {
    if (!isGestor) {
      alert("Apenas o gestor pode excluir subtarefas.");
      return;
    }
    if (isSubExcluido) {
      executarRestaurarDiretoSub(tarefaRaiz, caminhoIds);
    } else {
      setModalExclusao({ isOpen: true, tipo: 'sub', tarefa: tarefaRaiz, caminhoIds });
    }
  };

  const executarRestaurarDiretoPai = async (tarefa) => {
    try {
      const subTarefasAtualizadas = setTrashRecursiveProp(tarefa.subTarefas, false);
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        excluido: false,
        subTarefas: subTarefasAtualizadas
      });
    } catch (e) {
      alert("Erro ao restaurar: " + e.message);
    }
  };

  const executarRestaurarDiretoSub = async (tarefaRaiz, caminhoIds) => {
    try {
      const subTarefasAtualizadas = trashNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
      const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
        subTarefas: subTarefasAtualizadas
      });
    } catch (e) {
      alert("Erro ao restaurar subtarefa: " + e.message);
    }
  };

  const executarExclusaoConfirmada = async () => {
    try {
      if (modalExclusao.tipo === 'pai') {
        const tarefa = modalExclusao.tarefa;
        const novoExcluido = !Boolean(tarefa.excluido);
        const subTarefasAtualizadas = setTrashRecursiveProp(tarefa.subTarefas, novoExcluido);
        const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
        await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
          excluido: novoExcluido,
          subTarefas: subTarefasAtualizadas
        });
        if (paginaLateral && paginaLateral.id === tarefa.id) fecharPainelLateral();
      } else if (modalExclusao.tipo === 'sub') {
        const tarefaRaiz = modalExclusao.tarefa;
        const caminhoIds = modalExclusao.caminhoIds;
        const subTarefasAtualizadas = trashNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
        const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';
        await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
          subTarefas: subTarefasAtualizadas
        });
      }
    } catch (e) {
      alert("Erro ao executar ação: " + e.message);
    } finally {
      setModalExclusao({ isOpen: false, tipo: null, tarefa: null, caminhoIds: null });
    }
  };

  const salvarEdicaoInlineTarefa = async (tarefaId, colecaoAlvo, novoTitulo, tarefaObj) => {
    if (!usuarioTemPermissaoTarefa(tarefaObj)) {
      alert("Acesso negado: Você não tem permissão para editar esta tarefa!");
      return;
    }
    if (!novoTitulo.trim()) return;
    try {
      const creator = tarefaObj.criadoPor || '';
      const needsEditor = creator && creator.toUpperCase() !== nomeFormatadoGlobal.toUpperCase();
      const updates = { titulo: novoTitulo.trim() };
      if (needsEditor) updates.editadoPor = nomeFormatadoGlobal;

      await updateDoc(doc(db, colecaoAlvo || 'tarefas_gerais', tarefaId), updates);
      setEditandoId(null);
    } catch (e) {}
  };

  const excluirTarefaDefinitivo = async (id, colecaoAlvo) => {
    if (!isGestor) return;
    if (window.confirm("ATENÇÃO: Deseja excluir DEFINTIVAMENTE este item da lixeira?")) {
      try {
        await deleteDoc(doc(db, colecaoAlvo || 'tarefas_gerais', id));
        if (paginaLateral && paginaLateral.id === id) fecharPainelLateral();
      } catch (err) {}
    }
  };

  const salvarAlteracoesPaginaLateral = async () => {
    if (!paginaLateral) return;
    
    if (!usuarioTemPermissaoTarefa(paginaLateral) && !isGestor) {
      setModalAlerta({ isOpen: true, titulo: 'Acesso Negado', mensagem: 'Você não tem permissão para editar o conteúdo desta tarefa!' });
      return;
    }
    
    try {
      const colecaoAlvo = paginaLateral._colecao || 'tarefas_gerais';
      
      if (paginaLateral.isSub) {
        const tarefaRaiz = tarefas.find(t => t.id === paginaLateral.raizId);
        if (!tarefaRaiz) return;

        const novaSubTarefas = updateSubNoteInTree(tarefaRaiz.subTarefas || [], paginaLateral.caminhoIds, editDescricaoLateral.trim(), nomeFormatadoGlobal);
        const subAtualizada = updateSubTextInTree(novaSubTarefas, paginaLateral.caminhoIds, editTituloLateral.trim(), nomeFormatadoGlobal);

        await updateDoc(doc(db, colecaoAlvo, paginaLateral.raizId), {
          subTarefas: subAtualizada
        });
      } else {
        if (!editTituloLateral.trim()) return;
        const creator = paginaLateral.criadoPor || '';
        const needsEditor = creator && creator.toUpperCase() !== nomeFormatadoGlobal.toUpperCase();
        const updates = {
          titulo: editTituloLateral.trim(),
          blocoNotas: editDescricaoLateral.trim()
        };
        if (needsEditor) updates.editadoPor = nomeFormatadoGlobal;

        await updateDoc(doc(db, colecaoAlvo, paginaLateral.id), updates);
      }
      
      // Salva silenciosamente e fecha o painel lateral de forma automática
      fecharPainelLateral();
      
    } catch (e) {
      setModalAlerta({ isOpen: true, titulo: 'Erro', mensagem: "Erro ao salvar: " + e.message });
    }
  };
const renderizarCaminhoBreadcrumb = (pagina) => {
    if (!pagina) return 'Biblioteca';
    if (!pagina.isSub) return `Biblioteca / ${editTituloLateral || pagina.titulo}`;
    
    const raiz = tarefas.find(t => t.id === pagina.raizId);
    if (!raiz) return `Biblioteca / ${editTituloLateral || pagina.titulo}`;
    
    let caminho = [raiz.titulo];
    let atual = raiz.subTarefas || [];
    const ids = pagina.caminhoIds || [];
    
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const node = atual.find(s => s.id === id);
      if (node) {
        // Se for a última subtarefa (a que está aberta), usa o texto que está sendo digitado
        if (i === ids.length - 1) {
          caminho.push(editTituloLateral || node.texto);
        } else {
          caminho.push(node.texto);
        }
        atual = node.subTarefas || [];
      }
    }
    return `Biblioteca / ${caminho.join(' / ')}`;
  };
  
  const theme = {
    bg: darkMode ? '#141414' : '#f7f6f2',
    sidebarBg: darkMode ? '#1c1c1c' : '#eeedeb',
    cardBg: darkMode ? '#1c1c1c' : '#ffffff',
    cardInner: darkMode ? '#242424' : '#f2f1ed',
    textMain: darkMode ? '#f4f4f0' : '#1a1a18',
    textMuted: darkMode ? '#b0b0a8' : '#555552',
    border: darkMode ? '#2e2e2e' : '#e0dfdb',
    inputBg: darkMode ? '#242424' : '#ffffff',
    inputText: darkMode ? '#f4f4f0' : '#1a1a18',
    primary: '#2eaadc',
    treeLine: darkMode ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)'
  };

  const renderizarPrioridadeBadge = (prio, onClickFn) => {
    let cor = '#27ae60'; 
    let texto = 'Baixa';
    if (prio === 'Média') {
      cor = '#d97706'; 
      texto = 'Média';
    } else if (prio === 'Alta') {
      cor = '#eb5757'; 
      texto = 'Alta';
    }
    return (
      <span 
        onClick={onClickFn}
        title="Clique para alterar a prioridade"
        style={{ 
          color: cor, 
          fontWeight: '700', 
          fontSize: '13px', 
          marginLeft: '10px', 
          background: cor + '15', 
          padding: '2px 8px', 
          borderRadius: '4px', 
          border: '1px solid ' + cor + '40',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'inline-block',
          transition: 'opacity 0.1s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        {texto}
      </span>
    );
  };

  // Renderização recursiva com cores por nível hierárquico
  const renderizarSubTarefasRecursivas = (subLista, tarefaRaizObj, caminhoPai, nivel = 1) => {
    if (!subLista || subLista.length === 0) return null;

  // 1. Tiramos o cálculo daqui de baixo e colocamos antes do return
  const baseIndent = 24;
  const stepIndent = 28;
  const currentIndent = baseIndent + ((nivel - 1) * stepIndent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', position: 'relative' }}>
      
      {/* 2. Nossa linha guia contínua entra aqui! */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: (currentIndent - 2) + 'px',
        width: '5px',
        pointerEvents: 'none',
        zIndex: 2,
        display: 'flex',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '1px',
          height: '100%',
          backgroundColor: theme.treeLine
        }} />
      </div>

      {subLista.map((sub, index) => {
        const caminhoAtual = [...caminhoPai, sub.id];
        const isExpandidoSub = verificarExpandido(sub.id);
        const isUltimo = index === subLista.length - 1;

          const isConcluida = Boolean(sub.concluida);
          const isArquivada = Boolean(sub.arquivada);
          const isExcluido = Boolean(sub.excluido);

          if (paginaAtual === 'andamento' && isExcluido) return null;
          if (paginaAtual === 'resolvidas' && (!isConcluida || isExcluido)) return null;
          if (paginaAtual === 'arquivados' && (isExcluido || !isArquivada)) return null;
          if (paginaAtual === 'lixeira' && !isExcluido) return null;

          const autorSub = sub.criadoPor || tarefaRaizObj.criadoPor || 'Usuário';
          const editorSub = sub.editadoPor;
          const displayAutorSub = editorSub && editorSub.toUpperCase() !== autorSub.toUpperCase() ? autorSub + ' (Editado por: ' + editorSub + ')' : autorSub;

          let corPendente = '#27ae60'; // Padrão verde
          if (nivel === 1) corPendente = '#2383e2'; // Azul para Filhas
          else if (nivel === 2) corPendente = '#9b59b6'; // Roxo para Netas
          else if (nivel >= 3) corPendente = '#e67e22'; // Laranja para Bisnetas (opcional)

          const corTextoSub = isConcluida ? '#27ae60' : corPendente;

          return (
            <React.Fragment key={sub.id}>
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                  padding: '12px 0', 
                  borderBottom: '1px solid ' + theme.border, 
                  alignItems: 'center', 
                  fontSize: '16px', 
                  transition: 'background 0.1s',
                  position: 'relative',
                  backgroundColor: isConcluida ? (darkMode ? 'rgba(39, 174, 96, 0.25)' : 'rgba(39, 174, 96, 0.18)') : 'transparent'
                }}
                onMouseEnter={(e) => { if (!isConcluida) e.currentTarget.style.background = theme.cardInner; }} 
                onMouseLeave={(e) => { if (!isConcluida) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Linha guia vertical */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: '-45px', // Aumente este valor negativo caso ainda precise descer mais
              left: currentIndent + 'px',
              width: '1px',
              backgroundColor: theme.treeLine,
              pointerEvents: 'none'
            }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', paddingLeft: (currentIndent - 4) + 'px', paddingRight: '10px', position: 'relative' }}>
                  <span style={{ fontFamily: 'monospace', color: theme.textMuted, fontSize: '13px', userSelect: 'none', fontWeight: 'bold' }}>
                    {isUltimo ? '└─' : '├─'}
                  </span>

                  <span onClick={() => alternarExpandido(sub.id)} style={{ cursor: 'pointer', fontSize: '11px', color: theme.textMain, userSelect: 'none', padding: '2px', width: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                    {isExpandidoSub ? '▼' : '▶'}
                  </span>

                  <span>📄</span>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span 
                      onClick={() => abrirPainelLateralSub(sub, tarefaRaizObj.id, caminhoAtual, tarefaRaizObj)}
                      style={{ fontWeight: isConcluida ? '600' : '400', fontSize: '15px', color: corTextoSub, textDecoration: isConcluida ? 'line-through' : 'none', whiteSpace: 'normal', wordBreak: 'break-word', cursor: 'pointer' }}
                    >
                      {sub.texto}
                    </span>
                    {renderizarPrioridadeBadge(sub.prioridade || 'Baixa', () => {
                      if (!verificarPermissaoNode(sub) && !isGestor) {
                        alert("Acesso negado: Você não tem permissão para alterar a prioridade desta subtarefa!");
                        return;
                      }
                      setModalEditarPrioridade({
                        isOpen: true,
                        isSub: true,
                        tarefaId: tarefaRaizObj.id,
                        caminhoIds: caminhoAtual,
                        prioridadeAtual: sub.prioridade || 'Baixa'
                      });
                    })}
                  </div>
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMain, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }}>
                  {displayAutorSub}
                </div>

                <div 
                  onClick={() => {
                    if (!verificarPermissaoNode(sub) && !isGestor) {
                      setModalAlerta({ isOpen: true, titulo: 'Acesso Negado', mensagem: 'Você não tem permissão para alterar os grupos desta subtarefa!' });
                      return;
                    }
                    setModalEditarGruposFonte({
                      isOpen: true,
                      isSub: true,
                      tarefaId: tarefaRaizObj.id,
                      caminhoIds: caminhoAtual,
                      gruposAtuais: sub.gruposSelecionados || { Particular: true, NOC: false, NIIP: false, NMR: false }
                    });
                  }}
                  title="Clique para alterar os grupos"
                  style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', textDecoration: 'underline dotted' }}
                >
                  🔒 {sub.fonteGrupos || 'Sub-tarefa'}
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px' }}>
                  {tempoDecorrido(sub.criadoEm || tarefaRaizObj.criadoEm)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted, fontSize: '14px', paddingRight: '10px' }}>
                  {paginaAtual !== 'lixeira' ? (
                    <button 
                      onClick={() => alternarStatusRecursivo(tarefaRaizObj, caminhoAtual)} 
                      style={{ background: isConcluida ? '#27ae60' : theme.cardInner, border: '1px solid ' + (isConcluida ? '#27ae60' : theme.border), color: isConcluida ? '#fff' : theme.textMain, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      {isConcluida ? '✔ Concluído' : 'Concluir'}
                    </button>
                  ) : <div></div>}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isGestor && (
                      <button onClick={() => tratarCliqueExcluirOuRestaurarSub(tarefaRaizObj, caminhoAtual, isExcluido)} style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                        {isExcluido ? 'Restaurar' : 'Excluir'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isExpandidoSub && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', position: 'relative' }}>
                  {renderizarSubTarefasRecursivas(sub.subTarefas, tarefaRaizObj, caminhoAtual, nivel + 1)}
                  
                  {paginaAtual === 'andamento' && !isExcluido && (
                    <div 
                      onClick={() => {
                        if (!verificarPermissaoNode(sub) && !isGestor) {
                          alert("Acesso negado: Você não tem permissão para adicionar subtarefas aqui!");
                          return;
                        }
                        setModalNovaSub({ isOpen: true, tarefaRaizId: tarefaRaizObj.id, caminhoIds: caminhoAtual });
                      }}
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: theme.textMuted,
                        background: 'transparent', // Garante que nunca terá fundo cinza
                        position: 'relative',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = theme.textMain}
                      onMouseLeave={(e) => e.currentTarget.style.color = theme.textMuted}
                    >
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: (currentIndent + stepIndent) + 'px',
                        width: '1px',
                        backgroundColor: theme.treeLine,
                        pointerEvents: 'none'
                      }} />
                      <div style={{ paddingLeft: (currentIndent + stepIndent - 4) + 'px', display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                        <span style={{ fontFamily: 'monospace', color: theme.textMuted, fontSize: '13px', fontWeight: 'bold' }}>└─</span>
                        <span>+</span> <span>Adicionar nova</span>
                      </div>
                      <div></div><div></div><div></div><div></div>
                    </div>
                  )}
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
      <div style={{ color: '#f4f4f0', backgroundColor: '#141414', textAlign: 'center', marginTop: '40vh', fontFamily: 'sans-serif', minHeight: '100vh', fontSize: '16px', fontWeight: 'bold' }}>
        Carregando workspace...
      </div>
    );
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={alternarTema} theme={theme} />;
  }

  const tarefasResolvidas = tarefas.filter(t => t.status === 'Resolvida' && !t.arquivada && !t.excluido);
  const tarefasArquivadas = tarefas.filter(t => t.arquivada && !t.excluido);
  const tarefasLixeira = tarefas.filter(t => t.excluido);

  const tarefasFiltradas = tarefas.filter(t => {
    const isArquivada = Boolean(t.arquivada);
    const isExcluido = Boolean(t.excluido);
    const isConcluida = t.status === 'Resolvida';

    if (paginaAtual === 'andamento' && isExcluido) return false;
    if (paginaAtual === 'lixeira' && !isExcluido) return false;
    if (paginaAtual === 'arquivados' && (!isArquivada || isExcluido)) return false;
    if (paginaAtual === 'resolvidas' && (!isConcluida || isArquivada || isExcluido)) return false;

    if (filtroResponsavel !== 'todos' && t.responsavel !== filtroResponsavel) return false;

    if (filtroPalavraChave.trim() !== '') {
      const termo = filtroPalavraChave.toLowerCase();
      const tituloMatch = t.titulo && t.titulo.toLowerCase().includes(termo);
      const descMatch = t.blocoNotas && t.blocoNotas.toLowerCase().includes(termo);
      const respMatch = t.responsavel && t.responsavel.toLowerCase().includes(termo);
      
      const matchSub = (subs) => {
        if (!subs) return false;
        return subs.some(s => (s.texto && s.texto.toLowerCase().includes(termo)) || (s.subTarefas && matchSub(s.subTarefas)));
      };

      if (!tituloMatch && !descMatch && !respMatch && !matchSub(t.subTarefas)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="workspace-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: theme.bg, color: theme.textMain, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
      
      {/* SIDEBAR ESQUERDA NOTION */}
      <div className="sidebar-notion" style={{ width: '250px', background: theme.sidebarBg, borderRight: '1px solid ' + theme.border, display: 'flex', flexDirection: 'column', padding: '16px 10px', boxSizing: 'border-box', flexShrink: '0' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', marginBottom: '18px', background: theme.cardBg, border: '1px solid ' + theme.border }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2eaadc', color: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {nomeFormatadoGlobal.charAt(0) || 'J'}
          </div>
          <span style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: theme.textMain }}>Espaço de {nomeFormatadoGlobal || 'Usuário'}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', marginBottom: '20px', fontWeight: '500' }}>
          <div onClick={() => mudarPagina('andamento')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', background: !paginaLateral && paginaAtual === 'andamento' ? theme.cardInner : 'transparent', color: theme.textMain }}>
            <span>🏠</span> <span>Página inicial</span>
          </div>
          <div onClick={() => mudarPagina('resolvidas')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', background: paginaAtual === 'resolvidas' ? theme.cardInner : 'transparent', color: theme.textMain }}>
            <span>✅</span> <span>Resolvidas ({tarefasResolvidas.length})</span>
          </div>
          <div onClick={() => mudarPagina('arquivados')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', background: paginaAtual === 'arquivados' ? theme.cardInner : 'transparent', color: theme.textMain }}>
            <span>📁</span> <span>Arquivados ({tarefasArquivadas.length})</span>
          </div>
          
          {isGestor && (
            <div onClick={() => mudarPagina('lixeira')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', background: paginaAtual === 'lixeira' ? theme.cardInner : 'transparent', color: theme.textMain }}>
              <span>🗑️</span> <span>Lixeira ({tarefasLixeira.length})</span>
            </div>
          )}
        </div>

        <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, padding: '0 10px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Páginas Recentes
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', overflowY: 'auto', maxHeight: '40vh', marginBottom: '20px' }}>
          {tarefas.filter(t => !t.arquivada && !t.excluido).map(t => (
            <div 
              key={t.id} 
              onClick={() => {
                setPaginaAtual('andamento');
                abrirPainelLateral(t);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', background: paginaLateral?.id === t.id ? theme.cardInner : 'transparent', color: paginaLateral?.id === t.id ? theme.textMain : theme.textMuted, fontWeight: '500' }}
            >
              <span>📄</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid ' + theme.border, paddingTop: '12px' }}>
          <button onClick={() => signOut(auth)} style={{ background: 'transparent', border: '1px solid #eb5757', color: '#eb5757', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', textAlign: 'left' }}>
            Sair
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL SPLIT-VIEW */}
      <div style={{ flex: 1, display: 'flex', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        
        {/* CONTEÚDO DA BIBLIOTECA COM SUPORTE A TELA RESPONSIVA */}
        <div className="main-content-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '36px 52px', boxSizing: 'border-box', overflowY: 'auto' }}>
          
          {/* CABEÇALHO E BOTÃO NOVA PÁGINA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: theme.textMain, letterSpacing: '-0.5px' }}>
              {paginaAtual === 'resolvidas' ? '✅ Resolvidas' : paginaAtual === 'arquivados' ? '📁 Arquivados' : paginaAtual === 'lixeira' ? '🗑️ Lixeira' : 'Biblioteca'}
            </h1>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <button onClick={alternarTema} style={{ background: theme.cardBg, border: '1px solid ' + theme.border, color: theme.textMain, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {darkMode ? '☀️ Claro' : '🌙 Escuro'}
              </button>
              {paginaAtual !== 'lixeira' && (
                <button 
                  onClick={() => setModalNovaPagina(true)}
                  style={{ background: '#2383e2', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                >
                  Nova página
                </button>
              )}
            </div>
          </div>

          {/* ABAS SUPERIORES COM CAMPO DE BUSCA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid ' + theme.border, paddingBottom: '12px', marginBottom: '24px', fontSize: '14px', flexWrap: 'wrap', gap: '16px', fontWeight: '600' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', color: theme.textMuted }}>
              <span onClick={() => mudarPagina('andamento')} style={{ fontWeight: paginaAtual === 'andamento' ? '700' : '500', color: paginaAtual === 'andamento' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>🕒 Recentes</span>
              <span onClick={() => mudarPagina('resolvidas')} style={{ fontWeight: paginaAtual === 'resolvidas' ? '700' : '500', color: paginaAtual === 'resolvidas' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>✅ Resolvidas</span>
              <span onClick={() => mudarPagina('arquivados')} style={{ fontWeight: paginaAtual === 'arquivados' ? '700' : '500', color: paginaAtual === 'arquivados' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>📁 Arquivados</span>
              {isGestor && (
                <span onClick={() => mudarPagina('lixeira')} style={{ fontWeight: paginaAtual === 'lixeira' ? '700' : '500', color: paginaAtual === 'lixeira' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>🗑️ Lixeira ({tarefasLixeira.length})</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                value={filtroPalavraChave} 
                onChange={(e) => setFiltroPalavraChave(e.target.value)}
                placeholder="Filtrar por palavra-chave..." 
                style={{ padding: '7px 12px', background: theme.inputBg, border: '1px solid ' + theme.border, color: theme.inputText, borderRadius: '6px', fontSize: '13px', outline: 'none', width: '200px', fontWeight: '500' }}
              />
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '7px 12px', background: theme.inputBg, border: '1px solid ' + theme.border, color: theme.inputText, borderRadius: '6px', fontSize: '13px', fontWeight: '500' }}>
                <option value="todos">Responsável: Todos</option>
                {TODOS_INTEGRANTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* TABELA DE DADOS COM WRAPPER RESPONSIVO PARA EVITAR CORTE EM DISPOSITIVOS MÓVEIS */}
          <div className="table-responsive-wrapper" style={{ width: '100%', boxSizing: 'border-box' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', padding: '10px 0', borderBottom: '2px solid ' + theme.border, fontSize: '13px', fontWeight: '700', color: theme.textMuted, minWidth: '700px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>📄 Nome da página</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>👤 Criado por</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>📑 Fonte</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>🕒 Última edição</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>Ações</div>
            </div>

            {tarefasFiltradas.length === 0 ? (
              <div style={{ padding: '50px', textAlign: 'center', color: theme.textMuted, fontSize: '15px', fontWeight: '500' }}>Nenhuma página encontrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '700px' }}>
                {tarefasFiltradas.map(t => {
                  const subTarefas = t.subTarefas || [];
                  const temFilhos = subTarefas.length > 0;
                  const isExpandido = verificarExpandido(t.id);
                  const isConcluida = t.status === 'Resolvida';
                  const isArquivada = Boolean(t.arquivada);
                  const isExcluido = Boolean(t.excluido);

                  const creatorPai = t.criadoPor || 'Usuário';
                  const editorPai = t.editadoPor;
                  const displayAutorPai = editorPai && editorPai.toUpperCase() !== creatorPai.toUpperCase() ? creatorPai + ' (Editado por: ' + editorPai + ')' : creatorPai;

                  return (
                    <React.Fragment key={t.id}>
                      {/* LINHA PRINCIPAL DA PÁGINA PAI (EM NEGRITO FORTE - TAREFA PAI COM FONTE MAIOR) */}
                      <div 
                        onDoubleClick={() => { setEditandoId(t.id); setTextoEditando(t.titulo); }}
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                          padding: '12px 0', 
                          borderBottom: '1px solid ' + theme.border, 
                          alignItems: 'center', 
                          fontSize: '14px', 
                          transition: 'background 0.1s',
                          backgroundColor: isConcluida ? (darkMode ? 'rgba(39, 174, 96, 0.25)' : 'rgba(39, 174, 96, 0.18)') : 'transparent'
                        }} 
                        onMouseEnter={(e) => { if (!isConcluida) e.currentTarget.style.background = theme.cardInner; }} 
                        onMouseLeave={(e) => { if (!isConcluida) e.currentTarget.style.background = 'transparent'; }}
                      >
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', paddingRight: '10px' }}>
                          <span onClick={() => alternarExpandido(t.id)} style={{ cursor: 'pointer', fontSize: '11px', color: theme.textMain, userSelect: 'none', padding: '2px', width: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                            {isExpandido ? '▼' : '▶'}
                          </span>
                          <span>📄</span>
                          {editandoId === t.id ? (
                            <input 
                              type="text" 
                              value={textoEditando}
                              autoFocus
                              onChange={(e) => setTextoEditando(e.target.value)}
                              onBlur={() => salvarEdicaoInlineTarefa(t.id, t._colecao, textoEditando, t)}
                              onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicaoInlineTarefa(t.id, t._colecao, textoEditando, t); }}
                              style={{ background: theme.inputBg, border: '1px solid ' + theme.border, color: theme.inputText, padding: '4px 8px', fontSize: '17px', borderRadius: '4px', width: '80%', fontWeight: '800' }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                              <span 
                                onClick={() => abrirPainelLateral(t)}
                                style={{ fontWeight: '800', fontSize: '17px', color: isConcluida ? '#27ae60' : theme.textMain, textDecoration: isConcluida ? 'line-through' : 'none', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {t.titulo}
                              </span>
                              {renderizarPrioridadeBadge(t.prioridade || 'Baixa', () => {
                                if (!verificarPermissaoNode(t) && !isGestor) {
                                  setModalAlerta({ isOpen: true, titulo: 'Acesso Negado', mensagem: 'Você não tem permissão para alterar os grupos desta tarefa!' });
                                  return;
                                }
                                setModalEditarPrioridade({
                                  isOpen: true,
                                  isSub: false,
                                  tarefaId: t.id,
                                  caminhoIds: null,
                                  prioridadeAtual: t.prioridade || 'Baixa'
                                });
                              })}
                            </div>
                          )}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMain, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '600' }}>
                          {displayAutorPai}
                        </div>

                        {/* Coluna Fonte com verificação estrita de permissão */}
                        <div 
                          onClick={() => {
                            if (!verificarPermissaoNode(t) && !isGestor) {
                              setModalAlerta({
                                isOpen: true,
                                titulo: 'Acesso Negado',
                                mensagem: 'Você não tem permissão para alterar os grupos desta tarefa!'
                              });
                              return;
                            }
                            setModalEditarGruposFonte({
                              isOpen: true,
                              isSub: false,
                              tarefaId: t.id,
                              caminhoIds: null,
                              gruposAtuais: t.gruposSelecionados || { Particular: true, NOC: false, NIIP: false, NMR: false }
                            });
                          }}
                          title="Clique para alterar os grupos"
                          style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline dotted' }}
                        >
                          🔒 {t.fonteGrupos || 'Particular'}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px', fontWeight: '500' }}>
                          {tempoDecorrido(t.criadoEm)}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: theme.textMuted, fontSize: '14px', paddingRight: '10px' }}>
                          {paginaAtual !== 'lixeira' ? (
                            <button 
                              onClick={() => alternarStatusTarefaPai(t)} 
                              style={{ background: isConcluida ? '#27ae60' : theme.cardInner, border: '1px solid ' + (isConcluida ? '#27ae60' : theme.border), color: isConcluida ? '#fff' : theme.textMain, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                            >
                              {isConcluida ? '✔ Concluído' : 'Concluir'}
                            </button>
                          ) : <div></div>}

                          <div style={{ display: 'flex', gap: '10px' }}>
                            {paginaAtual !== 'lixeira' && (
                              <button onClick={() => arquivarTarefaPai(t)} title="Arquivar / Desarquivar" style={{ background: 'transparent', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                {isArquivada ? 'Desarquivar' : 'Arquivar'}
                              </button>
                            )}
                            {/* Botão de Excluir visível APENAS para o Gestor (Duandys) */}
                            {isGestor && (
                              <button onClick={() => tratarCliqueExcluirOuRestaurarPai(t)} title="Lixeira" style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                                {isExcluido ? 'Restaurar' : 'Excluir'}
                              </button>
                            )}
                            {isGestor && paginaAtual === 'lixeira' && (
                              <button onClick={() => excluirTarefaDefinitivo(t.id, t._colecao)} title="Excluir Definitivo" style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Destruir</button>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* SUB-PÁGINAS RECURSIVAS E BOTÃO "+ Adicionar nova" */}
                      {isExpandido && (
                        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                          {renderizarSubTarefasRecursivas(subTarefas, t, [], 1)}
                          {paginaAtual === 'andamento' && !isExcluido && (
                            <div 
                              onClick={() => {
                                if (!verificarPermissaoNode(t) && !isGestor) {
                                  alert("Acesso negado: Você não tem permissão para adicionar subtarefas nesta página!");
                                  return;
                                }
                                setModalNovaSub({ isOpen: true, tarefaRaizId: t.id, caminhoIds: [] });
                              }}
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                                padding: '12px 0', 
                                borderBottom: '1px solid ' + theme.border, 
                                alignContent: 'center', 
                                alignItems: 'center', 
                                fontSize: '14px', 
                                color: theme.textMain, 
                                cursor: 'pointer', 
                                transition: 'background 0.1s',
                                background: theme.cardInner,
                                fontWeight: '600',
                                position: 'relative'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: '24px',
                                width: '1px',
                                backgroundColor: theme.treeLine,
                                pointerEvents: 'none'
                              }} />
                              <div style={{ paddingLeft: '32px', display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                                <span style={{ fontFamily: 'monospace', color: theme.textMuted, fontSize: '13px', fontWeight: 'bold' }}>└─</span>
                                <span>+</span> <span>Adicionar nova</span>
                              </div>
                              <div></div><div></div><div></div><div></div>
                            </div>
                          )}
                        </div>
                      )}

                    </React.Fragment>
                  );
                })}
              </div>
            )}

          </div>

        </div>

        {/* MODAL DE CRIAÇÃO DE NOVA PÁGINA PRINCIPAL */}
        {modalNovaPagina && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid ' + theme.border, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Criar Nova Página</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Título da Tarefa</label>
                <input 
                  type="text" 
                  value={novoTituloModal}
                  onChange={(e) => setNovoTituloModal(e.target.value)}
                  placeholder="Digite o título..."
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prioridade</label>
                <select 
                  value={novaPrioridadeModal} 
                  onChange={(e) => setNovaPrioridadeModal(e.target.value)} 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '600', outline: 'none' }}
                >
                  <option value="Baixa" style={{ color: '#27ae60' }}>🟢 Baixa</option>
                  <option value="Média" style={{ color: '#d97706' }}>🟠 Média</option>
                  <option value="Alta" style={{ color: '#eb5757' }}>🔴 Alta</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Visibilidade / Grupos (Escolha um ou mais)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: theme.cardInner, padding: '12px', borderRadius: '6px', border: '1px solid ' + theme.border }}>
                  {Object.keys(novosGruposModal).map((grupo) => (
                    <label key={grupo} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', color: theme.textMain }}>
                      <input 
                        type="checkbox" 
                        checked={novosGruposModal[grupo]} 
                        onChange={(e) => setNovosGruposModal({ ...novosGruposModal, [grupo]: e.target.checked })}
                        style={{ accentColor: '#2383e2', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      {grupo === 'Particular' && '🔒 '}
                      {grupo === 'NOC' && '👥 Grupo do NOC'}
                      {grupo === 'NIIP' && '👥 Grupo do NIIP'}
                      {grupo === 'NMR' && '👥 Grupo do NMR'}
                      {grupo !== 'NOC' && grupo !== 'NIIP' && grupo !== 'NMR' && grupo}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setModalNovaPagina(false)} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: '1px solid ' + theme.border, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button onClick={confirmarCriacaoNovaPagina} style={{ flex: 1, padding: '10px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Criar</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE CRIAÇÃO DE SUBTAREFA */}
        {modalNovaSub.isOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid ' + theme.border, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Adicionar Subtarefa</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Título da Subtarefa</label>
                <input 
                  type="text" 
                  value={subTituloModal}
                  onChange={(e) => setSubTituloModal(e.target.value)}
                  placeholder="Digite o título..."
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prioridade</label>
                <select 
                  value={subPrioridadeModal} 
                  onChange={(e) => setSubPrioridadeModal(e.target.value)} 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '600', outline: 'none' }}
                >
                  <option value="Baixa" style={{ color: '#27ae60' }}>🟢 Baixa</option>
                  <option value="Média" style={{ color: '#d97706' }}>🟠 Média</option>
                  <option value="Alta" style={{ color: '#eb5757' }}>🔴 Alta</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Visibilidade / Grupos (Escolha um ou mais)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: theme.cardInner, padding: '12px', borderRadius: '6px', border: '1px solid ' + theme.border }}>
                  {Object.keys(subGruposModal).map((grupo) => (
                    <label key={grupo} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', color: theme.textMain }}>
                      <input 
                        type="checkbox" 
                        checked={subGruposModal[grupo]} 
                        onChange={(e) => setSubGruposModal({ ...subGruposModal, [grupo]: e.target.checked })}
                        style={{ accentColor: '#2383e2', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      {grupo === 'Particular' && '🔒 '}
                      {grupo === 'NOC' && '👥 Grupo do NOC'}
                      {grupo === 'NIIP' && '👥 Grupo do NIIP'}
                      {grupo === 'NMR' && '👥 Grupo do NMR'}
                      {grupo !== 'NOC' && grupo !== 'NIIP' && grupo !== 'NMR' && grupo}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setModalNovaSub({ isOpen: false, tarefaRaizId: null, caminhoIds: null })} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: '1px solid ' + theme.border, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button onClick={confirmarCriacaoSubtarefa} style={{ flex: 1, padding: '10px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Adicionar</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE EDIÇÃO DE GRUPOS DA FONTE */}
        {modalEditarGruposFonte.isOpen && (
          <ModalEditarGruposFonte 
            modalState={modalEditarGruposFonte}
            onClose={() => setModalEditarGruposFonte({ isOpen: false, isSub: false, tarefaId: null, caminhoIds: null, gruposAtuais: {} })}
            onSave={salvarEdicaoGruposFonte}
            theme={theme}
          />
        )}

        {/* MODAL DE EDIÇÃO DE PRIORIDADE */}
        {modalEditarPrioridade.isOpen && (
          <ModalEditarPrioridade 
            modalState={modalEditarPrioridade}
            onClose={() => setModalEditarPrioridade({ isOpen: false, isSub: false, tarefaId: null, caminhoIds: null, prioridadeAtual: 'Baixa' })}
            onSave={salvarEdicaoPrioridade}
            theme={theme}
          />
        )}

        {/* POP-UP DE CONFIRMAÇÃO DE EXCLUSÃO */}
        {modalExclusao.isOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid ' + theme.border, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Confirmação de Exclusão</h3>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px', fontWeight: '500' }}>Tem certeza de que deseja excluir este item?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setModalExclusao({ isOpen: false, tipo: null, tarefa: null, caminhoIds: null })} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: '1px solid ' + theme.border, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button onClick={executarExclusaoConfirmada} style={{ flex: 1, padding: '10px', background: '#eb5757', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Sim, excluir</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE ALERTA CUSTOMIZADO */}
        {modalAlerta.isOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '400px', border: '1px solid ' + theme.border, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 12px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>
                {modalAlerta.titulo}
              </h3>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px', fontWeight: '500', lineHeight: '1.5' }}>
                {modalAlerta.mensagem}
              </p>
              <button 
                onClick={() => setModalAlerta({ isOpen: false, titulo: '', mensagem: '' })} 
                style={{ width: '100%', padding: '10px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
              >
                Entendi
              </button>
            </div>
          </div>
        )}
        
        {/* PAINEL LATERAL DIREITO (SPLIT-VIEW) - BLOCO DE NOTAS LIMPO E INDEPENDENTE */}
        {paginaLateral && (
          <div className="lateral-panel" style={{ width: '450px', background: theme.cardBg, borderLeft: '1px solid ' + theme.border, display: 'flex', flexDirection: 'column', padding: '36px', boxSizing: 'border-box', height: '100vh', overflowY: 'auto', flexShrink: '0', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '600' }}>
                {renderizarCaminhoBreadcrumb(paginaLateral)}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={salvarAlteracoesPaginaLateral} title="Salvar Alterações" style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>✓ Concluir</button>
                <button onClick={fecharPainelLateral} style={{ background: 'transparent', border: '1px solid ' + theme.border, color: theme.textMain, padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>✕ Fechar</button>
              </div>
            </div>

            <textarea 
              key={paginaLateral.id}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }}
              value={editTituloLateral} 
              onChange={(e) => {
                setEditTituloLateral(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              rows="1"
              style={{ 
                fontSize: '28px', 
                fontWeight: '800', 
                color: theme.textMain, 
                background: 'transparent', 
                border: 'none', 
                outline: 'none', 
                width: '100%', 
                marginBottom: '24px',
                resize: 'none',
                overflow: 'hidden',
                fontFamily: 'inherit',
                lineHeight: '1.2'
              }}
            />

            <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conteúdo / Bloco de Notas</label>
              <textarea 
                rows="10"
                value={editDescricaoLateral}
                onChange={(e) => setEditDescricaoLateral(e.target.value)}
                placeholder="Escreva suas anotações aqui..."
                style={{ width: '100%', padding: '14px', background: theme.cardInner, border: '1px solid ' + theme.border, color: theme.inputText, borderRadius: '6px', fontSize: '14px', resize: 'vertical', lineHeight: '1.6', fontWeight: '500' }}
              />
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

// Componente auxiliar para o modal de alteração de grupos da fonte
function ModalEditarGruposFonte({ modalState, onClose, onSave, theme }) {
  const [gruposSelecionados, setGruposSelecionados] = useState(
    modalState.gruposAtuais || { Particular: true, NOC: false, NIIP: false, NMR: false }
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
      <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: '1px solid ' + theme.border, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Alterar Atribuição de Grupos</h3>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selecione os Grupos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: theme.cardInner, padding: '12px', borderRadius: '6px', border: '1px solid ' + theme.border }}>
            {['Particular', 'NOC', 'NIIP', 'NMR'].map((grupo) => (
              <label key={grupo} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', color: theme.textMain }}>
                <input 
                  type="checkbox" 
                  checked={Boolean(gruposSelecionados[grupo])} 
                  onChange={(e) => setGruposSelecionados({ ...gruposSelecionados, [grupo]: e.target.checked })}
                  style={{ accentColor: '#2383e2', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                {grupo === 'Particular' && '🔒 '}
                {grupo === 'NOC' && '👥 Grupo do NOC'}
                {grupo === 'NIIP' && '👥 Grupo do NIIP'}
                {grupo === 'NMR' && '👥 Grupo do NMR'}
                {grupo !== 'NOC' && grupo !== 'NIIP' && grupo !== 'NMR' && grupo}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: '1px solid ' + theme.border, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
          <button onClick={() => onSave(gruposSelecionados)} style={{ flex: 1, padding: '10px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// Componente auxiliar para o modal de alteração de prioridade
function ModalEditarPrioridade({ modalState, onClose, onSave, theme }) {
  const [prioridadeSelecionada, setPrioridadeSelecionada] = useState(modalState.prioridadeAtual || 'Baixa');

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
      <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '380px', border: '1px solid ' + theme.border, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'left' }}>
        <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Alterar Prioridade</h3>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selecione o Nível</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: theme.cardInner, padding: '12px', borderRadius: '6px', border: '1px solid ' + theme.border }}>
            {['Baixa', 'Média', 'Alta'].map((item) => (
              <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', color: theme.textMain }}>
                <input 
                  type="radio" 
                  name="prioridadeModalRadio" 
                  checked={prioridadeSelecionada === item} 
                  onChange={() => setPrioridadeSelecionada(item)}
                  style={{ accentColor: '#2383e2', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                {item === 'Baixa' && '🟢 Baixa'}
                {item === 'Média' && '🟠 Média'}
                {item === 'Alta' && '🔴 Alta'}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: '1px solid ' + theme.border, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
          <button onClick={() => onSave(prioridadeSelecionada)} style={{ flex: 1, padding: '10px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function TelaLogin({ onLoginSucesso, darkMode, setDarkMode, theme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [isTrocarSenha, setIsTrocarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');
    try {
      const result = await signInWithEmailAndPassword(auth, email, senha);
      onLoginSucesso(result.user.email);
    } catch (e) {
      setErro('Erro ao entrar: Verifique seu e-mail e senha.');
    }
  };

  const handleTrocarSenha = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, senhaAtual);
      await updatePassword(userCredential.user, novaSenha);
      setSucesso('Senha alterada com sucesso! Faça login com a nova senha.');
      setIsTrocarSenha(false);
      setSenhaAtual('');
      setNovaSenha('');
      setSenha('');
    } catch (e) {
      setErro('Erro ao alterar senha: Verifique se o e-mail e a senha atual estão corretos.');
    }
  };

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box', padding: '20px', position: 'relative' }}>
      <button type="button" onClick={setDarkMode} style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: '1px solid ' + theme.border, color: theme.textMain, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <form onSubmit={isTrocarSenha ? handleTrocarSenha : handleLogin} style={{ background: theme.cardBg, padding: '36px 28px', borderRadius: '8px', width: '100%', maxWidth: '380px', border: '1px solid ' + theme.border, boxSizing: 'border-box', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '160px', height: 'auto', objectFit: 'contain', margin: '0 auto 16px auto', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
          <span style={{ fontSize: '18px', color: theme.textMain, fontWeight: '800', display: 'block' }}>Sistema Integrado</span>
          <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600', display: 'block', marginTop: '4px' }}>Central de Tarefas</span>
        </div>

        {erro && <p style={{ color: '#eb5757', fontSize: '13px', marginBottom: '16px', background: darkMode ? '#3b1c1c' : '#fde8e8', padding: '10px', borderRadius: '6px', fontWeight: '600' }}>{erro}</p>}
        {sucesso && <p style={{ color: '#27ae60', fontSize: '13px', marginBottom: '16px', background: darkMode ? '#1c3b27' : '#e8fdf0', padding: '10px', borderRadius: '6px', fontWeight: '600' }}>{sucesso}</p>}
          
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@fibralink.net.br" style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500' }} />
        </div>

        {!isTrocarSenha ? (
          <>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Senha</label>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500' }} />
            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#2383e2', border: 'none', color: '#fff', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', marginBottom: '10px', fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.15)' }}>
              Entrar
            </button>
            <button type="button" onClick={() => { setIsTrocarSenha(true); setErro(''); setSucesso(''); }} style={{ background: 'transparent', border: 'none', color: '#2383e2', cursor: 'pointer', fontSize: '13px', fontWeight: '700', width: '100%', textAlign: 'center', padding: '6px' }}>
              Trocar senha
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Senha Atual</label>
              <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nova Senha</label>
              <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + theme.border, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500' }} />
            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#27ae60', border: 'none', color: '#fff', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', marginBottom: '10px', fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.15)' }}>
              Atualizar Senha
            </button>
            <button type="button" onClick={() => { setIsTrocarSenha(false); setErro(''); setSucesso(''); }} style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '13px', fontWeight: '600', width: '100%', textAlign: 'center', padding: '6px' }}>
              Voltar ao Login
            </button>
          </>
        )}
      </form>
    </div>
  );
}

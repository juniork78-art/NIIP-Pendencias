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

const tempoDecorrido = (timestamp) => {
  if (!timestamp) return 'Agora há pouco';
  const agora = Date.now();
  const diffMs = agora - timestamp;
  const diffSeg = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSeg / 60);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffSeg < 60) return 'Há poucos segundos';
  if (diffMin < 60) return `Há ${diffMin} minuto${diffMin > 1 ? 's' : ''}`;
  if (diffHoras < 24) return `Há ${diffHoras} hora${diffHoras > 1 ? 's' : ''}`;
  if (diffDias < 30) return `Há ${diffDias} dia${diffDias > 1 ? 's' : ''}`;
  const diffMeses = Math.floor(diffDias / 30);
  if (diffMeses < 12) return `Há ${diffMeses} mês${diffMeses > 1 ? 'es' : ''}`;
  const diffAnos = Math.floor(diffDias / 365);
  return `Há ${diffAnos} ano${diffAnos > 1 ? 's' : ''}`;
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

  const [tarefaEditando, setTarefaEditando] = useState(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editPrazo, setEditPrazo] = useState('');
  const [editPrioridade, setEditPrioridade] = useState('');

  // Estados para modais
  const [modalExclusao, setModalExclusao] = useState({ isOpen: false, tipo: null, tarefa: null, caminhoIds: null });
  const [modalNovaPagina, setModalNovaPagina] = useState(false);
  const [novoTituloModal, setNovoTituloModal] = useState('');
  const [novaPrioridadeModal, setNovaPrioridadeModal] = useState('Baixa');

  const [expandidoIds, setExpandidoIds] = useState(() => {
    try {
      const salvo = localStorage.getItem('expandidoIds_fibralink');
      return salvo ? JSON.parse(salvo) : {};
    } catch (e) {
      return {};
    }
  });

  const alternarExpandido = (id) => {
    setExpandidoIds(prev => {
      const novo = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('expandidoIds_fibralink', JSON.stringify(novo));
      } catch (e) {}
      return novo;
    });
  };

  const verificarExpandido = (id, temFilhos) => {
    if (expandidoIds[id] !== undefined) {
      return expandidoIds[id];
    }
    return temFilhos ? true : false;
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

  const abrirPainelLateralSub = (sub, raizId, caminhoIds, tarefaPai) => {
    const subObj = {
      isSub: true,
      raizId,
      caminhoIds,
      id: sub.id,
      titulo: sub.texto,
      descricao: sub.descricao || 'Sub-tarefa',
      responsavel: tarefaPai.responsavel,
      concluida: Boolean(sub.concluida),
      arquivada: Boolean(sub.arquivada),
      excluido: Boolean(sub.excluido),
      criadoPor: sub.criadoPor || tarefaPai.criadoPor,
      editadoPor: sub.editadoPor,
      _colecao: tarefaPai._colecao
    };
    setPaginaLateral(subObj);
    setEditTituloLateral(sub.texto);
    setEditDescricaoLateral(sub.descricao || '');
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

  // Função para criar nova página pelo Modal
  const confirmarCriacaoNovaPagina = () => {
    if (!novoTituloModal.trim()) {
      alert("Digite um título para a página.");
      return;
    }
    const novaId = Date.now().toString();
    const dataHoje = new Date().toISOString().split('T')[0];

    setDoc(doc(db, 'tarefas_gerais', novaId), {
      titulo: novoTituloModal.trim(),
      descricao: 'Particular',
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
    }).catch(e => alert("Erro ao criar página: " + e.message));
  };

  // Funções Auxiliares de Propagação Recursiva
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

  // Árvore Recursiva
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
          return { ...item, concluida: !Boolean(item.concluida) };
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

  const updateTextNodeInTree = (lista, ids, newText, newDesc, editorName) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          const creator = item.criadoPor || '';
          const needsEditor = creator && creator.toUpperCase() !== editorName.toUpperCase();
          return { 
            ...item, 
            texto: newText, 
            ...(newDesc !== undefined && { descricao: newDesc }),
            ...(needsEditor && { editadoPor: editorName })
          };
        } else {
          return {
            ...item,
            subTarefas: updateTextNodeInTree(item.subTarefas || [], ids.slice(1), newText, newDesc, editorName)
          };
        }
      }
      return item;
    });
  };

  const todasSubTarefasConcluidas = (subLista) => {
    if (!subLista || subLista.length === 0) return true;
    for (const sub of subLista) {
      if (!sub.concluida && !sub.excluido) return false;
      if (sub.subTarefas && sub.subTarefas.length > 0) {
        if (!todasSubTarefasConcluidas(sub.subTarefas)) return false;
      }
    }
    return true;
  };

  const promptAdicionarSub = (tarefaRaizId, caminhoIds) => {
    const subTexto = prompt("Digite o título da nova subtarefa:");
    if (!subTexto || !subTexto.trim()) return;

    const tarefaRaiz = tarefas.find(t => t.id === tarefaRaizId);
    if (!tarefaRaiz) return;

    const novaSub = {
      id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 5),
      texto: subTexto.trim(),
      concluida: false,
      arquivada: false,
      excluido: false,
      criadoPor: nomeFormatadoGlobal || 'Usuário',
      subTarefas: []
    };

    const novaSubTarefas = insertNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds, novaSub);
    const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';

    updateDoc(doc(db, colecaoAlvo, tarefaRaizId), {
      subTarefas: novaSubTarefas
    }).then(() => {
      setExpandidoIds(prev => {
        const targetId = caminhoIds.length > 0 ? caminhoIds[caminhoIds.length - 1] : tarefaRaizId;
        const novo = { ...prev, [targetId]: true };
        try { localStorage.setItem('expandidoIds_fibralink', JSON.stringify(novo)); } catch(e){}
        return novo;
      });
    }).catch(e => alert("Erro ao adicionar subtarefa: " + e.message));
  };

  const alternarStatusTarefaPai = async (tarefa) => {
    try {
      const novoStatus = tarefa.status === 'Resolvida' ? 'Pendente' : 'Resolvida';
      if (novoStatus === 'Resolvida') {
        if (!todasSubTarefasConcluidas(tarefa.subTarefas)) {
          alert("Você não pode concluir a tarefa pai sem que todas as subtarefas estejam concluídas primeiro!");
          return;
        }
      }
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        status: novoStatus
      });
    } catch (e) {}
  };

  const arquivarTarefaPai = async (tarefa) => {
    if (!window.confirm("Deseja realmente alterar o status de arquivamento desta página?")) return;
    try {
      const novaArquivada = !Boolean(tarefa.arquivada);
      const novasSubs = setArchiveRecursiveProp(tarefa.subTarefas, novaArquivada);
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        arquivada: novaArquivada,
        subTarefas: novasSubs
      });
      if (paginaLateral && paginaLateral.id === tarefa.id) fecharPainelLateral();
    } catch (e) {}
  };

  const tratarCliqueExcluirOuRestaurarPai = (tarefa) => {
    if (tarefa.excluido) {
      executarRestaurarDiretoPai(tarefa);
    } else {
      setModalExclusao({ isOpen: true, tipo: 'pai', tarefa, caminhoIds: null });
    }
  };

  const tratarCliqueExcluirOuRestaurarSub = (tarefaRaiz, caminhoIds, isSubExcluido) => {
    if (isSubExcluido) {
      executarRestaurarDiretoSub(tarefaRaiz, caminhoIds);
    } else {
      setModalExclusao({ isOpen: true, tipo: 'sub', tarefa: tarefaRaiz, caminhoIds });
    }
  };

  const executarRestaurarDiretoPai = async (tarefa) => {
    try {
      const novasSubs = setTrashRecursiveProp(tarefa.subTarefas, false);
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        excluido: false,
        subTarefas: novasSubs
      });
    } catch (e) {
      alert("Erro ao restaurar: " + e.message);
    }
  };

  const executarRestaurarDiretoSub = async (tarefaRaiz, caminhoIds) => {
    try {
      const novaSubTarefas = trashNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
      const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
        subTarefas: novaSubTarefas
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
        const novasSubs = setTrashRecursiveProp(tarefa.subTarefas, novoExcluido);
        const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
        await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
          excluido: novoExcluido,
          subTarefas: novasSubs
        });
        if (paginaLateral && paginaLateral.id === tarefa.id) fecharPainelLateral();
      } else if (modalExclusao.tipo === 'sub') {
        const tarefaRaiz = modalExclusao.tarefa;
        const caminhoIds = modalExclusao.caminhoIds;
        const novaSubTarefas = trashNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
        const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';
        await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
          subTarefas: novaSubTarefas
        });
      }
    } catch (e) {
      alert("Erro ao executar ação: " + e.message);
    } finally {
      setModalExclusao({ isOpen: false, tipo: null, tarefa: null, caminhoIds: null });
    }
  };

  const alternarStatusRecursivo = async (tarefaRaiz, caminhoIds) => {
    try {
      const novaSubTarefas = toggleNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
      const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';

      await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
        subTarefas: novaSubTarefas
      });
    } catch (e) {}
  };

  const salvarEdicaoInlineTarefa = async (tarefaId, colecaoAlvo, novoTitulo, tarefaObj) => {
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
    if (window.confirm("ATENÇÃO: Deseja excluir DEFINTIVAMENTE este item da lixeira?")) {
      try {
        await deleteDoc(doc(db, colecaoAlvo || 'tarefas_gerais', id));
        if (paginaLateral && paginaLateral.id === id) fecharPainelLateral();
      } catch (err) {}
    }
  };

  const salvarAlteracoesPaginaLateral = async () => {
    if (!paginaLateral) return;
    try {
      const colecaoAlvo = paginaLateral._colecao || 'tarefas_gerais';
      if (paginaLateral.isSub) {
        const tarefaRaiz = tarefas.find(t => t.id === paginaLateral.raizId);
        if (!tarefaRaiz) return;

        const novaSubTarefas = updateTextNodeInTree(tarefaRaiz.subTarefas || [], paginaLateral.caminhoIds, editTituloLateral.trim(), editDescricaoLateral.trim(), nomeFormatadoGlobal);
        await updateDoc(doc(db, colecaoAlvo, paginaLateral.raizId), {
          subTarefas: novaSubTarefas
        });
        setPaginaLateral(prev => ({ ...prev, titulo: editTituloLateral.trim(), descricao: editDescricaoLateral.trim() }));
      } else {
        if (!editTituloLateral.trim()) return;
        const creator = paginaLateral.criadoPor || '';
        const needsEditor = creator && creator.toUpperCase() !== nomeFormatadoGlobal.toUpperCase();
        const updates = {
          titulo: editTituloLateral.trim(),
          descricao: editDescricaoLateral.trim()
        };
        if (needsEditor) updates.editadoPor = nomeFormatadoGlobal;

        await updateDoc(doc(db, colecaoAlvo, paginaLateral.id), updates);
        setPaginaLateral(prev => ({ ...prev, titulo: editTituloLateral.trim(), descricao: editDescricaoLateral.trim() }));
      }
      alert("Alterações salvas com sucesso!");
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    }
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
    treeLine: darkMode ? '#555550' : '#c8c8c2'
  };

  // Retorna a cor e o estilo para a prioridade solicitada
  const renderizarPrioridadeBadge = (prio) => {
    let cor = '#27ae60'; // Baixa (Verde)
    let texto = 'Baixa';
    if (prio === 'Média') {
      cor = '#d97706'; // Média (Laranja)
      texto = 'Média';
    } else if (prio === 'Alta') {
      cor = '#eb5757'; // Alta (Vermelha)
      texto = 'Alta';
    }
    return (
      <span style={{ color: cor, fontWeight: '700', fontSize: '13px', marginLeft: '10px', background: `${cor}15`, padding: '2px 8px', borderRadius: '4px', border: `1px solid ${cor}40` }}>
        {texto}
      </span>
    );
  };

  const renderizarSubTarefasRecursivas = (subLista, tarefaRaizObj, caminhoPai, nivel = 1) => {
    if (!subLista || subLista.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {subLista.map((sub) => {
          const caminhoAtual = [...caminhoPai, sub.id];
          const temFilhos = sub.subTarefas && sub.subTarefas.length > 0;
          const isExpandidoSub = verificarExpandido(sub.id, temFilhos);
          const paddingLeftPx = nivel * 24 + 16;
          const isConcluida = Boolean(sub.concluida);
          const isArquivada = Boolean(sub.arquivada);
          const isExcluido = Boolean(sub.excluido);

          if (paginaAtual === 'andamento' && (isArquivada || isExcluido)) return null;
          if (paginaAtual === 'arquivados' && (isExcluido || !isArquivada)) return null;
          if (paginaAtual === 'lixeira' && !isExcluido) return null;

          const autorSub = sub.criadoPor || tarefaRaizObj.criadoPor || 'Usuário';
          const editorSub = sub.editadoPor;
          const displayAutorSub = editorSub && editorSub.toUpperCase() !== autorSub.toUpperCase() ? `${autorSub} (Editado por: ${editorSub})` : autorSub;

          return (
            <React.Fragment key={sub.id}>
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                  padding: '12px 0', 
                  borderBottom: `1px solid ${theme.border}`, 
                  alignItems: 'center', 
                  fontSize: '14px', 
                  transition: 'background 0.1s',
                  backgroundColor: isConcluida ? (darkMode ? 'rgba(39, 174, 96, 0.25)' : 'rgba(39, 174, 96, 0.18)') : 'transparent'
                }}
                onMouseEnter={(e) => { if (!isConcluida) e.currentTarget.style.background = theme.cardInner; }} 
                onMouseLeave={(e) => { if (!isConcluida) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', paddingLeft: `${paddingLeftPx}px`, paddingRight: '10px' }}>
                  <span onClick={() => alternarExpandido(sub.id)} style={{ cursor: 'pointer', fontSize: '11px', color: theme.textMain, userSelect: 'none', padding: '2px', width: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                    {isExpandidoSub ? '▼' : '▶'}
                  </span>
                  {paginaAtual !== 'lixeira' && (
                    <input type="checkbox" checked={isConcluida} onChange={() => alternarStatusRecursivo(tarefaRaizObj, caminhoAtual)} style={{ accentColor: '#27ae60', cursor: 'pointer', width: '16px', height: '16px' }} />
                  )}
                  <span>📄</span>
                  <span 
                    onClick={() => abrirPainelLateralSub(sub, tarefaRaizObj.id, caminhoAtual, tarefaRaizObj)}
                    style={{ fontWeight: isConcluida ? '600' : '400', color: isConcluida ? '#27ae60' : theme.textMain, textDecoration: isConcluida ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                  >
                    {sub.texto}
                  </span>
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMain, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }}>
                  {displayAutorSub}
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  📄 Sub-tarefa
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px' }}>
                  {tempoDecorrido(tarefaRaizObj.criadoEm)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted, fontSize: '14px', paddingRight: '10px' }}>
                  {paginaAtual === 'andamento' ? (
                    <button 
                      onClick={() => alternarStatusRecursivo(tarefaRaizObj, caminhoAtual)} 
                      style={{ background: isConcluida ? '#27ae60' : theme.cardInner, border: `1px solid ${isConcluida ? '#27ae60' : theme.border}`, color: isConcluida ? '#fff' : theme.textMain, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      {isConcluida ? '✔ Concluído' : 'Concluir'}
                    </button>
                  ) : <div></div>}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => tratarCliqueExcluirOuRestaurarSub(tarefaRaizObj, caminhoAtual, isExcluido)} style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                      {isExcluido ? 'Restaurar' : 'Excluir'}
                    </button>
                  </div>
                </div>
              </div>

              {isExpandidoSub && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  {renderizarSubTarefasRecursivas(sub.subTarefas, tarefaRaizObj, caminhoAtual, nivel + 1)}
                  
                  {paginaAtual === 'andamento' && !isExcluido && (
                    <div 
                      onClick={() => promptAdicionarSub(tarefaRaizObj.id, caminhoAtual)}
                      style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                        padding: '12px 0', 
                        borderBottom: `1px solid ${theme.border}`, 
                        alignItems: 'center', 
                        fontSize: '14px', 
                        color: theme.textMain, 
                        cursor: 'pointer', 
                        transition: 'background 0.1s',
                        background: theme.cardInner,
                        fontWeight: '600' 
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ paddingLeft: `${paddingLeftPx + 24}px`, display: 'flex', alignItems: 'center', gap: '8px' }}>
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

    if (paginaAtual === 'lixeira' && !isExcluido) return false;
    if (paginaAtual === 'arquivados' && (!isArquivada || isExcluido)) return false;
    if (paginaAtual === 'andamento' && (isArquivada || isExcluido)) return false;
    if (filtroResponsavel !== 'todos' && t.responsavel !== filtroResponsavel) return false;

    // Filtro por palavra-chave
    if (filtroPalavraChave.trim() !== '') {
      const termo = filtroPalavraChave.toLowerCase();
      const tituloMatch = t.titulo && t.titulo.toLowerCase().includes(termo);
      const descMatch = t.descricao && t.descricao.toLowerCase().includes(termo);
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
    <div className="workspace-layout" style={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', boxSizing: 'border-box' }}>
      
      {/* SIDEBAR ESQUERDA NOTION */}
      <div className="sidebar-notion" style={{ width: '250px', background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '16px 10px', boxSizing: 'border-box', flexShrink: '0' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', marginBottom: '18px', background: theme.cardBg, border: `1px solid ${theme.border}` }}>
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
              onClick={() => abrirPainelLateral(t)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', background: paginaLateral?.id === t.id ? theme.cardInner : 'transparent', color: paginaLateral?.id === t.id ? theme.textMain : theme.textMuted, fontWeight: '500' }}
            >
              <span>📄</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
          <button onClick={() => signOut(auth)} style={{ background: 'transparent', border: '1px solid #eb5757', color: '#eb5757', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', textAlign: 'left' }}>
            Sair
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL SPLIT-VIEW */}
      <div style={{ flex: 1, display: 'flex', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        
        {/* CONTEÚDO DA BIBLIOTECA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '36px 52px', boxSizing: 'border-box', overflowY: 'auto' }}>
          
          {/* CABEÇALHO E BOTÃO NOVA PÁGINA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '800', color: theme.textMain, letterSpacing: '-0.5px' }}>
              {paginaAtual === 'arquivados' ? '📁 Arquivados' : paginaAtual === 'lixeira' ? '🗑️ Lixeira' : 'Biblioteca'}
            </h1>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <button onClick={alternarTema} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {darkMode ? '☀️ Claro' : '🌙 Escuro'}
              </button>
              {paginaAtual === 'andamento' && (
                <button 
                  onClick={() => setModalNovaPagina(true)}
                  style={{ background: '#2383e2', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                >
                  Nova página
                </button>
              )}
            </div>
          </div>

          {/* ABAS SUPERIORES COM CAMPO DE BUSCA POR PALAVRA-CHAVE */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '24px', fontSize: '14px', flexWrap: 'wrap', gap: '16px', fontWeight: '600' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', color: theme.textMuted }}>
              <span onClick={() => mudarPagina('andamento')} style={{ fontWeight: paginaAtual === 'andamento' ? '700' : '500', color: paginaAtual === 'andamento' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>🕒 Recentes</span>
              <span onClick={() => mudarPagina('arquivados')} style={{ fontWeight: paginaAtual === 'arquivados' ? '700' : '500', color: paginaAtual === 'arquivados' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>📁 Arquivados</span>
              {isGestor && (
                <span onClick={() => mudarPagina('lixeira')} style={{ fontWeight: paginaAtual === 'lixeira' ? '700' : '500', color: paginaAtual === 'lixeira' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>🗑️ Lixeira</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <input 
                type="text" 
                value={filtroPalavraChave} 
                onChange={(e) => setFiltroPalavraChave(e.target.value)}
                placeholder="Filtrar por palavra-chave..." 
                style={{ padding: '7px 12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', fontSize: '13px', outline: 'none', width: '200px', fontWeight: '500' }}
              />
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '7px 12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', fontSize: '13px', fontWeight: '500' }}>
                <option value="todos">Responsável: Todos</option>
                {TODOS_INTEGRANTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* TABELA DE DADOS ESTILO NOTION */}
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', padding: '10px 0', borderBottom: `2px solid ${theme.border}`, fontSize: '13px', fontWeight: '700', color: theme.textMuted, minWidth: '700px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                  const isExpandido = verificarExpandido(t.id, temFilhos);
                  const isConcluida = t.status === 'Resolvida';
                  const isArquivada = Boolean(t.arquivada);
                  const isExcluido = Boolean(t.excluido);

                  const creatorPai = t.criadoPor || 'Usuário';
                  const editorPai = t.editadoPor;
                  const displayAutorPai = editorPai && editorPai.toUpperCase() !== creatorPai.toUpperCase() ? `${creatorPai} (Editado por: ${editorPai})` : creatorPai;

                  return (
                    <React.Fragment key={t.id}>
                      {/* LINHA PRINCIPAL DA PÁGINA PAI (EM NEGRITO FORTE) */}
                      <div 
                        onDoubleClick={() => { setEditandoId(t.id); setTextoEditando(t.titulo); }}
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                          padding: '12px 0', 
                          borderBottom: `1px solid ${theme.border}`, 
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
                            {temFilhos ? (isExpandido ? '▼' : '▶') : ''}
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
                              style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, padding: '4px 8px', fontSize: '14px', borderRadius: '4px', width: '80%', fontWeight: '700' }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                              <span 
                                onClick={() => abrirPainelLateral(t)}
                                style={{ fontWeight: '700', color: isConcluida ? '#27ae60' : theme.textMain, textDecoration: isConcluida ? 'line-through' : 'none', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {t.titulo}
                              </span>
                              {renderizarPrioridadeBadge(t.prioridade)}
                            </div>
                          )}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMain, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '600' }}>
                          {displayAutorPai}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMain, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '600' }}>
                          🔒 {t.descricao || 'Particular'}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '14px', fontWeight: '500' }}>
                          {tempoDecorrido(t.criadoEm)}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: theme.textMuted, fontSize: '14px', paddingRight: '10px' }}>
                          {paginaAtual === 'andamento' ? (
                            <button 
                              onClick={() => alternarStatusTarefaPai(t)} 
                              style={{ background: isConcluida ? '#27ae60' : theme.cardInner, border: `1px solid ${isConcluida ? '#27ae60' : theme.border}`, color: isConcluida ? '#fff' : theme.textMain, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
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
                            <button onClick={() => tratarCliqueExcluirOuRestaurarPai(t)} title="Lixeira" style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                              {isExcluido ? 'Restaurar' : 'Excluir'}
                            </button>
                            {isGestor && paginaAtual === 'lixeira' && (
                              <button onClick={() => excluirTarefaDefinitivo(t.id, t._colecao)} title="Excluir Definitivo" style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Destruir</button>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* SUB-PÁGINAS RECURSIVAS E BOTÃO "+ Adicionar nova" */}
                      {isExpandido && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {renderizarSubTarefasRecursivas(subTarefas, t, [], 1)}
                          {paginaAtual === 'andamento' && !isExcluido && (
                            <div 
                              onClick={() => promptAdicionarSub(t.id, [])}
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                                padding: '12px 0', 
                                borderBottom: `1px solid ${theme.border}`, 
                                alignContent: 'center', 
                                alignItems: 'center', 
                                fontSize: '14px', 
                                color: theme.textMain, 
                                cursor: 'pointer', 
                                transition: 'background 0.1s',
                                background: theme.cardInner,
                                fontWeight: '600'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ paddingLeft: '40px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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

        {/* MODAL DE CRIAÇÃO DE NOVA PÁGINA */}
        {modalNovaPagina && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'left' }}>
              <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Criar Nova Página</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Título da Tarefa</label>
                <input 
                  type="text" 
                  value={novoTituloModal}
                  onChange={(e) => setNovoTituloModal(e.target.value)}
                  placeholder="Digite o título..."
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prioridade</label>
                <select 
                  value={novaPrioridadeModal} 
                  onChange={(e) => setNovaPrioridadeModal(e.target.value)} 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '600', outline: 'none' }}
                >
                  <option value="Baixa" style={{ color: '#27ae60' }}>🟢 Baixa</option>
                  <option value="Média" style={{ color: '#d97706' }}>🟠 Média</option>
                  <option value="Alta" style={{ color: '#eb5757' }}>🔴 Alta</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setModalNovaPagina(false)} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: `1px solid ${theme.border}`, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button onClick={confirmarCriacaoNovaPagina} style={{ flex: 1, padding: '10px', background: '#2383e2', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Criar</button>
              </div>
            </div>
          </div>
        )}

        {/* POP-UP DE CONFIRMAÇÃO DE EXCLUSÃO */}
        {modalExclusao.isOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, padding: '28px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '18px', fontWeight: '700' }}>Confirmação de Exclusão</h3>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px', fontWeight: '500' }}>Tem certeza de que deseja excluir este item?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setModalExclusao({ isOpen: false, tipo: null, tarefa: null, caminhoIds: null })} style={{ flex: 1, padding: '10px', background: theme.cardInner, color: theme.textMain, border: `1px solid ${theme.border}`, borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button onClick={executarExclusaoConfirmada} style={{ flex: 1, padding: '10px', background: '#eb5757', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Sim, excluir</button>
              </div>
            </div>
          </div>
        )}

        {/* PAINEL LATERAL DIREITO (SPLIT-VIEW) */}
        {paginaLateral && (
          <div style={{ width: '450px', background: theme.cardBg, borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '36px', boxSizing: 'border-box', height: '100vh', overflowY: 'auto', flexShrink: '0', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '600' }}>
                Biblioteca / {paginaLateral.titulo}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={salvarAlteracoesPaginaLateral} title="Salvar Alterações" style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>✓ Concluir</button>
                <button onClick={fecharPainelLateral} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>✕ Fechar</button>
              </div>
            </div>

            <input 
              type="text" 
              value={editTituloLateral} 
              onChange={(e) => setEditTituloLateral(e.target.value)}
              style={{ fontSize: '28px', fontWeight: '800', color: theme.textMain, background: 'transparent', border: 'none', outline: 'none', width: '100%', marginBottom: '24px' }}
            />

            <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conteúdo / Bloco de Notas</label>
              <textarea 
                rows="10"
                value={editDescricaoLateral}
                onChange={(e) => setEditDescricaoLateral(e.target.value)}
                placeholder="Escreva suas anotações aqui..."
                style={{ width: '100%', padding: '14px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', fontSize: '14px', resize: 'vertical', lineHeight: '1.6', fontWeight: '500' }}
              />
            </div>

          </div>
        )}

      </div>

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
      <button type="button" onClick={setDarkMode} style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <form onSubmit={handleLogin} style={{ background: theme.cardBg, padding: '36px 28px', borderRadius: '8px', width: '100%', maxWidth: '380px', border: `1px solid ${theme.border}`, boxSizing: 'border-box', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{ fontSize: '16px', color: theme.textMain, fontWeight: '800', display: 'block' }}>Sistema Integrado</span>
          <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600', display: 'block', marginTop: '4px' }}>Central de Tarefas</span>
        </div>

        {erro && <p style={{ color: '#eb5757', fontSize: '13px', marginBottom: '16px', background: darkMode ? '#3b1c1c' : '#fde8e8', padding: '10px', borderRadius: '6px', fontWeight: '600' }}>{erro}</p>}
          
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@fibralink.net.br" style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500' }} />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px', fontWeight: '500' }} />
        </div>

        <button type="submit" style={{ width: '100%', padding: '12px', background: '#2383e2', border: 'none', color: '#fff', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', marginBottom: '12px', fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.15)' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}

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
  
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescription] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('Média');
  const [responsavelSelecionadoGestor, setResponsavelSelecionadoGestor] = useState(TODOS_INTEGRANTES[0]);
  
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
      prazo: tarefaPai.prazo,
      prioridade: tarefaPai.prioridade,
      concluida: Boolean(sub.concluida),
      arquivada: Boolean(sub.arquivada),
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

  const updateTextNodeInTree = (lista, ids, newText, newDesc) => {
    if (!ids || ids.length === 0) return lista;
    return (lista || []).map(item => {
      if (item.id === ids[0]) {
        if (ids.length === 1) {
          return { ...item, texto: newText, ...(newDesc !== undefined && { descricao: newDesc }) };
        } else {
          return {
            ...item,
            subTarefas: updateTextNodeInTree(item.subTarefas || [], ids.slice(1), newText, newDesc)
          };
        }
      }
      return item;
    });
  };

  // Função auxiliar para validar se todas as subtarefas e filhas estão concluídas
  const todasSubTarefasConcluidas = (subLista) => {
    if (!subLista || subLista.length === 0) return true;
    for (const sub of subLista) {
      if (!sub.concluida) return false;
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
      const colecaoAlvo = tarefa._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefa.id), {
        arquivada: novaArquivada
      });
      if (paginaLateral && paginaLateral.id === tarefa.id) fecharPainelLateral();
    } catch (e) {}
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

  const arquivarSubRecursivo = async (tarefaRaiz, caminhoIds) => {
    if (!window.confirm("Deseja realmente alterar o status de arquivamento desta subtarefa?")) return;
    try {
      const novaSubTarefas = archiveNodeInTree(tarefaRaiz.subTarefas || [], caminhoIds);
      const colecaoAlvo = tarefaRaiz._colecao || 'tarefas_gerais';

      await updateDoc(doc(db, colecaoAlvo, tarefaRaiz.id), {
        subTarefas: novaSubTarefas
      });
    } catch (e) {}
  };

  const salvarEdicaoInlineTarefa = async (tarefaId, colecaoAlvo, novoTitulo) => {
    if (!novoTitulo.trim()) return;
    try {
      await updateDoc(doc(db, colecaoAlvo || 'tarefas_gerais', tarefaId), {
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
      const colecaoAlvo = tarefaEditando._colecao || 'tarefas_gerais';
      await updateDoc(doc(db, colecaoAlvo, tarefaEditando.id), {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim(),
        prazo: editPrazo,
        prioridade: editPrioridade
      });
      setTarefaEditando(null);
    } catch (err) {}
  };

  const excluirTarefaDefinitivo = async (id, colecaoAlvo, tituloTarefa) => {
    if (window.confirm("Deseja realmente excluir DEFINTIVAMENTE esta página?")) {
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

        const novaSubTarefas = updateTextNodeInTree(tarefaRaiz.subTarefas || [], paginaLateral.caminhoIds, editTituloLateral.trim(), editDescricaoLateral.trim());
        await updateDoc(doc(db, colecaoAlvo, paginaLateral.raizId), {
          subTarefas: novaSubTarefas
        });
        setPaginaLateral(prev => ({ ...prev, titulo: editTituloLateral.trim(), descricao: editDescricaoLateral.trim() }));
      } else {
        if (!editTituloLateral.trim()) return;
        await updateDoc(doc(db, colecaoAlvo, paginaLateral.id), {
          titulo: editTituloLateral.trim(),
          descricao: editDescricaoLateral.trim()
        });
        setPaginaLateral(prev => ({ ...prev, titulo: editTituloLateral.trim(), descricao: editDescricaoLateral.trim() }));
      }
      alert("Alterações salvas com sucesso!");
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
    }
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

          if (paginaAtual === 'andamento' && isArquivada) return null;
          if (paginaAtual === 'arquivados' && !tarefaRaizObj.arquivada && !isArquivada) return null;

          return (
            <React.Fragment key={sub.id}>
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                  padding: '10px 0', 
                  borderBottom: `1px solid ${theme.border}`, 
                  alignItems: 'center', 
                  fontSize: '13px', 
                  transition: 'background 0.1s',
                  backgroundColor: isConcluida ? (darkMode ? 'rgba(39, 174, 96, 0.2)' : 'rgba(39, 174, 96, 0.15)') : 'transparent'
                }}
                onMouseEnter={(e) => { if (!isConcluida) e.currentTarget.style.background = theme.cardInner; }} 
                onMouseLeave={(e) => { if (!isConcluida) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', paddingLeft: `${paddingLeftPx}px`, paddingRight: '10px' }}>
                  <span onClick={() => alternarExpandido(sub.id)} style={{ cursor: 'pointer', fontSize: '10px', color: theme.textMuted, userSelect: 'none', padding: '2px', width: '12px', textAlign: 'center' }}>
                    {temFilhos ? (isExpandidoSub ? '▼' : '▶') : ''}
                  </span>
                  <input type="checkbox" checked={isConcluida} onChange={() => alternarStatusRecursivo(tarefaRaizObj, caminhoAtual)} style={{ accentColor: '#27ae60', cursor: 'pointer' }} />
                  <span>📄</span>
                  <span 
                    onClick={() => abrirPainelLateralSub(sub, tarefaRaizObj.id, caminhoAtual, tarefaRaizObj)}
                    style={{ fontWeight: isConcluida ? '600' : '400', color: isConcluida ? '#27ae60' : theme.textMain, textDecoration: isConcluida ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                  >
                    {sub.texto}
                  </span>
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tarefaRaizObj.responsavel || ' Junior Gonçalves'}
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  📄 Sub-tarefa
                </div>

                <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '13px' }}>
                  {isConcluida ? 'Concluída' : 'Agora há pouco'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted, fontSize: '13px', paddingRight: '10px' }}>
                  {paginaAtual === 'andamento' ? (
                    <button 
                      onClick={() => alternarStatusRecursivo(tarefaRaizObj, caminhoAtual)} 
                      style={{ background: isConcluida ? '#27ae60' : theme.cardInner, border: `1px solid ${isConcluida ? '#27ae60' : theme.border}`, color: isConcluida ? '#fff' : theme.textMain, padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                    >
                      {isConcluida ? '✔ Concluído' : 'Concluir'}
                    </button>
                  ) : <div></div>}

                  <button onClick={() => arquivarSubRecursivo(tarefaRaizObj, caminhoAtual)} style={{ background: 'transparent', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>
                    {isArquivada ? 'Desarquivar' : 'Arquivar'}
                  </button>
                </div>
              </div>

              {isExpandidoSub && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  {renderizarSubTarefasRecursivas(sub.subTarefas, tarefaRaizObj, caminhoAtual, nivel + 1)}
                  
                  {paginaAtual === 'andamento' && (
                    <div 
                      onClick={() => promptAdicionarSub(tarefaRaizObj.id, caminhoAtual)}
                      style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                        padding: '10px 0', 
                        borderBottom: `1px solid ${theme.border}`, 
                        alignItems: 'center', 
                        fontSize: '13px', 
                        color: theme.textMuted, 
                        cursor: 'pointer', 
                        transition: 'background 0.1s' 
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ paddingLeft: `${paddingLeftPx + 24}px`, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
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
      <div style={{ color: '#dbdbd7', backgroundColor: '#191919', textAlign: 'center', marginTop: '40vh', fontFamily: 'sans-serif', minHeight: '100vh', fontSize: '14px' }}>
        Carregando workspace...
      </div>
    );
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={alternarTema} theme={theme} />;
  }

  const tarefasResolvidas = tarefas.filter(t => t.status === 'Resolvida' && !t.arquivada);
  const tarefasArquivadas = tarefas.filter(t => t.arquivada);

  const tarefasFiltradas = tarefas.filter(t => {
    const isArquivada = Boolean(t.arquivada);
    if (paginaAtual === 'arquivados' && !isArquivada) return false;
    if (paginaAtual === 'andamento' && isArquivada) return false;
    if (filtroResponsavel !== 'todos' && t.responsavel !== filtroResponsavel) return false;
    return true;
  });

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
          <div onClick={() => mudarPagina('resolvidas')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: paginaAtual === 'resolvidas' ? theme.cardInner : 'transparent' }}>
            <span>✅</span> <span>Resolvidas ({tarefasResolvidas.length})</span>
          </div>
          <div onClick={() => mudarPagina('arquivados')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', background: paginaAtual === 'arquivados' ? theme.cardInner : 'transparent' }}>
            <span>📁</span> <span>Arquivados ({tarefasArquivadas.length})</span>
          </div>
        </div>

        <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, padding: '0 8px', marginBottom: '6px', textTransform: 'uppercase' }}>
          Páginas Recentes
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px', overflowY: 'auto', maxHeight: '40vh', marginBottom: '20px' }}>
          {tarefas.filter(t => !t.arquivada).map(t => (
            <div 
              key={t.id} 
              onClick={() => abrirPainelLateral(t)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', background: paginaLateral?.id === t.id ? theme.cardInner : 'transparent', color: paginaLateral?.id === t.id ? theme.textMain : theme.textMuted }}
            >
              <span>📄</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
          <button onClick={() => signOut(auth)} style={{ background: 'transparent', border: '1px solid #eb5757', color: '#eb5757', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', textAlign: 'left' }}>
            Sair
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL SPLIT-VIEW */}
      <div style={{ flex: 1, display: 'flex', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
        
        {/* CONTEÚDO DA BIBLIOTECA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px 48px', boxSizing: 'border-box', overflowY: 'auto' }}>
          
          {/* CABEÇALHO E BOTÃO NOVA PÁGINA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: theme.textMain }}>
              {paginaAtual === 'arquivados' ? '📁 Arquivados' : 'Biblioteca'}
            </h1>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={alternarTema} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                {darkMode ? '☀️ Claro' : '🌙 Escuro'}
              </button>
              {paginaAtual === 'andamento' && (
                <button 
                  onClick={() => {
                    const nome = prompt("Digite o título da nova página:");
                    if (nome) {
                      setTitulo(nome);
                      setPrazo(new Date().toISOString().split('T')[0]);
                      setTimeout(() => {
                        const novaId = Date.now().toString();
                        setDoc(doc(db, 'tarefas_gerais', novaId), {
                          titulo: nome.trim(),
                          descricao: 'Particular',
                          responsavel: responsavelFinal,
                          prazo: new Date().toISOString().split('T')[0],
                          prioridade: 'Média',
                          status: 'Pendente',
                          arquivada: false,
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
              )}
            </div>
          </div>

          {/* ABAS SUPERIORES */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px', marginBottom: '20px', fontSize: '13px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', color: theme.textMuted }}>
              <span onClick={() => mudarPagina('andamento')} style={{ fontWeight: paginaAtual === 'andamento' ? '600' : '400', color: paginaAtual === 'andamento' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>🕒 Recentes</span>
              <span onClick={() => mudarPagina('arquivados')} style={{ fontWeight: paginaAtual === 'arquivados' ? '600' : '400', color: paginaAtual === 'arquivados' ? theme.textMain : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>📁 Arquivados</span>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: theme.textMuted }}>
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '4px 8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
                <option value="todos">Responsável: Todos</option>
                {TODOS_INTEGRANTES.map(n => <option key={n} value={n}>{n}</option>)}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Ações</div>
            </div>

            {tarefasFiltradas.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Nenhuma página encontrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '700px' }}>
                {tarefasFiltradas.map(t => {
                  const subTarefas = t.subTarefas || [];
                  const temFilhos = subTarefas.length > 0;
                  const isExpandido = verificarExpandido(t.id, temFilhos);
                  const isConcluida = t.status === 'Resolvida';
                  const isArquivada = Boolean(t.arquivada);

                  return (
                    <React.Fragment key={t.id}>
                      {/* LINHA PRINCIPAL DA PÁGINA PAI */}
                      <div 
                        onDoubleClick={() => { setEditandoId(t.id); setTextoEditando(t.titulo); }}
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                          padding: '10px 0', 
                          borderBottom: `1px solid ${theme.border}`, 
                          alignItems: 'center', 
                          fontSize: '13px', 
                          transition: 'background 0.1s',
                          backgroundColor: isConcluida ? (darkMode ? 'rgba(39, 174, 96, 0.2)' : 'rgba(39, 174, 96, 0.15)') : 'transparent'
                        }} 
                        onMouseEnter={(e) => { if (!isConcluida) e.currentTarget.style.background = theme.cardInner; }} 
                        onMouseLeave={(e) => { if (!isConcluida) e.currentTarget.style.background = 'transparent'; }}
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
                              onBlur={() => salvarEdicaoInlineTarefa(t.id, t._colecao, textoEditando)}
                              onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicaoInlineTarefa(t.id, t._colecao, textoEditando); }}
                              style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, padding: '2px 6px', fontSize: '13px', borderRadius: '3px', width: '80%' }}
                            />
                          ) : (
                            <span 
                              onClick={() => abrirPainelLateral(t)}
                              style={{ fontWeight: isConcluida ? '600' : '400', color: isConcluida ? '#27ae60' : theme.textMain, textDecoration: isConcluida ? 'line-through' : 'none', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {t.titulo}
                            </span>
                          )}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.responsavel}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          🔒 {t.descricao || 'Particular'}
                        </div>

                        <div style={{ color: isConcluida ? '#27ae60' : theme.textMuted, fontSize: '13px' }}>
                          {isConcluida ? 'Concluída' : 'Agora há pouco'}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: theme.textMuted, fontSize: '13px', paddingRight: '10px' }}>
                          {paginaAtual === 'andamento' ? (
                            <button 
                              onClick={() => alternarStatusTarefaPai(t)} 
                              style={{ background: isConcluida ? '#27ae60' : theme.cardInner, border: `1px solid ${isConcluida ? '#27ae60' : theme.border}`, color: isConcluida ? '#fff' : theme.textMain, padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                            >
                              {isConcluida ? '✔ Concluído' : 'Concluir'}
                            </button>
                          ) : <div></div>}

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => arquivarTarefaPai(t)} title="Arquivar / Desarquivar" style={{ background: 'transparent', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>
                              {isArquivada ? 'Desarquivar' : 'Arquivar'}
                            </button>
                            {isGestor && (
                              <button onClick={() => excluirTarefaDefinitivo(t.id, t._colecao, t.titulo)} title="Excluir Definitivo" style={{ background: 'transparent', border: 'none', color: '#eb5757', cursor: 'pointer', fontSize: '11px' }}>Excluir</button>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* SUB-PÁGINAS RECURSIVAS E BOTÃO "+ Adicionar nova" */}
                      {isExpandido && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {renderizarSubTarefasRecursivas(subTarefas, t, [], 1)}
                          {paginaAtual === 'andamento' && (
                            <div 
                              onClick={() => promptAdicionarSub(t.id, [])}
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '2.5fr 1.5fr 1.5fr 1fr 1fr', 
                                padding: '10px 0', 
                                borderBottom: `1px solid ${theme.border}`, 
                                alignItems: 'center', 
                                fontSize: '13px', 
                                color: theme.textMuted, 
                                cursor: 'pointer', 
                                transition: 'background 0.1s',
                                background: theme.cardInner
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = theme.cardInner}
                              onMouseLeave={(e) => e.currentTarget.style.background = theme.cardInner}
                            >
                              <div style={{ paddingLeft: '40px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
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

        {/* PAINEL LATERAL DIREITO (SPLIT-VIEW) */}
        {paginaLateral && (
          <div style={{ width: '450px', background: theme.cardBg, borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '32px', boxSizing: 'border-box', height: '100vh', overflowY: 'auto', flexShrink: '0', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>
                Biblioteca / {paginaLateral.titulo}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={salvarAlteracoesPaginaLateral} title="Salvar Alterações" style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>✓ Concluir</button>
                <button onClick={fecharPainelLateral} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>✕ Fechar</button>
              </div>
            </div>

            <input 
              type="text" 
              value={editTituloLateral} 
              onChange={(e) => setEditTituloLateral(e.target.value)}
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
                placeholder="Escreva suas anotações aqui..."
                style={{ width: '100%', padding: '12px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', fontSize: '13px', resize: 'vertical', lineHeight: '1.6' }}
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
      <button type="button" onClick={setDarkMode} style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <form onSubmit={handleLogin} style={{ background: theme.cardBg, padding: '32px 24px', borderRadius: '6px', width: '100%', maxWidth: '360px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: theme.textMain, fontWeight: 'bold', display: 'block' }}>Sistema Integrado</span>
          <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500', display: 'block' }}>Central de Tarefas</span>
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

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

const style = document.createElement('style');
style.innerHTML = `
  @keyframes piscar {
    0% { opacity: 1; }
    50% { opacity: 0.3; }
    100% { opacity: 1; }
  }
  .alerta-vencido {
    color: #ff4d4d !important;
    animation: piscar 2s infinite;
    font-weight: bold;
  }
  .card-piscando {
    border-left: 4px solid #ff4d4d !important;
    animation: piscar 2s infinite;
  }

  /* GRID EXATO DE 4 COLUNAS PARA OS CARTOES */
  .cards-container-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 1400px) {
    .cards-container-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 1050px) {
    .cards-container-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* OTIMIZAÇÃO E PREENCHIMENTO PERFEITO PARA DISPOSITIVOS MÓVEIS (CELULARES) */
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
      padding: 10px !important;
      width: 100% !important;
    }
    .main-grid {
      grid-template-columns: 1fr !important;
      width: 100% !important;
      gap: 15px !important;
    }
    .cards-container-grid {
      grid-template-columns: 1fr !important;
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

// ORDEM: NOC, NMR e por fim NIIP
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
  const [paginaAtual, setPaginaAtual] = useState('andamento'); // 'andamento', 'resolvidas' ou 'auditoria'
  const [darkMode, setDarkMode] = useState(true);
  
  const [tarefas, setTarefas] = useState([]);
  const [logsAuditoria, setLogsAuditoria] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescription] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('Média');
  const [responsavelSelecionadoGestor, setResponsavelSelecionadoGestor] = useState('');
  
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');

  // Estados do Modal de Edição
  const [tarefaEditando, setTarefaEditando] = useState(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editPrazo, setEditPrazo] = useState('');
  const [editPrioridade, setEditPrioridade] = useState('');

  // Estados do Modal de Resolução
  const [tarefaResolvendo, setTarefaResolvendo] = useState(null);
  const [detalhesResolucaoInput, setDetalhesResolucaoInput] = useState('');

  // Estado do Pop-up de Alerta ao Login
  const [mostrarPopupAlerta, setMostrarPopupAlerta] = useState(false);
  const [tarefasUrgentesUsuario, setTarefasUrgentesUsuario] = useState([]);
  const [popupJaExibido, setPopupJaExibido] = useState(false);

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

      // Carrega logs de auditoria do setor
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
  const responsavelFinal = isGestor ? responsavelSelecionadoGestor : (integrantesAtuais.find(n => nomeFormatadoGlobal.includes(n.toUpperCase())) || integrantesAtuais[0] || 'Gestor');

  const adicionarTarefa = async (e) => {
    e.preventDefault();
    if (!titulo.trim() || !prazo) {
      alert("Preencha o título e a data limite da tarefa!");
      return;
    }

    const novaTarefaId = Date.now().toString();

    const tarefaObj = {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      responsavel: responsavelFinal,
      prazo,
      prioridade,
      status: 'Pendente',
      criadoPor: nomeFormatadoGlobal,
      criadoEm: Date.now()
    };

    try {
      await setDoc(doc(db, `${setorSelecionado}_tarefas`, novaTarefaId), tarefaObj);
      const prazoBr = formatarDataParaBr(prazo);
      await registrarLogAuditoria("CRIAÇÃO", `Criou a tarefa para [${responsavelFinal}] com prazo ${prazoBr} e prioridade ${prioridade}`, titulo.trim());
      setTitulo('');
      setDescription('');
      setPrazo('');
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
      if (tarefaEditando.prazo !== editPrazo) {
        const antigoBr = formatarDataParaBr(tarefaEditando.prazo);
        const novoBr = formatarDataParaBr(editPrazo);
        alteracoesStr.push(`Prazo alterado de [${antigoBr}] para [${novoBr}]`);
      }
      if (tarefaEditando.titulo !== editTitulo.trim()) {
        alteracoesStr.push(`Título alterado para "${editTitulo.trim()}"`);
      }
      if (tarefaEditando.prioridade !== editPrioridade) {
        alteracoesStr.push(`Prioridade alterada para ${editPrioridade}`);
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

  const theme = {
    bg: darkMode ? '#121212' : '#eef2f5',
    cardBg: darkMode ? '#1e1e1e' : '#ffffff',
    cardInner: darkMode ? '#252525' : '#f8f9fa',
    textMain: darkMode ? '#fff' : '#212529',
    textMuted: darkMode ? '#aaa' : '#555555',
    border: darkMode ? '#333' : '#d0d7de',
    inputBg: darkMode ? '#2d2d2d' : '#ffffff',
    inputText: darkMode ? '#fff' : '#212529',
    primary: '#007bff'
  };

  if (loadingAuth) {
    return <div style={{ color: theme.textMain, backgroundColor: theme.bg, textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif', minHeight: '100vh' }}>Carregando sistema...</div>;
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={setDarkMode} theme={theme} />;
  }

  const isGustavo = nomeFormatadoGlobal.includes('GUSTAVO');
  const isDhennifer = nomeFormatadoGlobal.includes('DHENNIFER');
  const isEspecialista = nomeFormatadoGlobal.includes('GILVAN') || nomeFormatadoGlobal.includes('STEVAN');
  const isNocN1 = nomeFormatadoGlobal.includes('TOLENTINO') || nomeFormatadoGlobal.includes('KESSY') || nomeFormatadoGlobal.includes('JOAO') || nomeFormatadoGlobal.includes('LUCAS');
  const isTecnicoN1 = nomeFormatadoGlobal.includes('FRANCISCO') || nomeFormatadoGlobal.includes('GABRIEL') || nomeFormatadoGlobal.includes('WALGNEY');
  
  const tipoCargo = isGestor 
    ? 'Gestor' 
    : isGustavo 
    ? 'NOC N3' 
    : isDhennifer 
    ? 'Analista N1' 
    : isEspecialista 
    ? 'Especialista' 
    : isNocN1 
    ? 'NOC N1' 
    : isTecnicoN1 
    ? 'Técnico N1' 
    : 'Integrante';

  if (!setorSelecionado && isGestor) {
    return (
      <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', padding: '15px', boxSizing: 'border-box', position: 'relative' }}>
        <button 
          onClick={() => setDarkMode(!darkMode)}
          style={{ position: 'absolute', top: '15px', right: '15px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
        >
          {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
        </button>

        <div style={{ maxWidth: '650px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: '26px', color: '#4dabf7', marginBottom: '8px' }}>Selecione o Setor</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '30px' }}>Painel do Gestor - Escolha qual núcleo deseja administrar:</p>
          
          <div style={{ display: 'grid', gap: '15px' }}>
            {SETORES_DISPONIVEIS.map(setor => (
              <div 
                key={setor.id} 
                onClick={() => { setSetorSelecionado(setor.id); setPaginaAtual('andamento'); }}
                style={{ 
                  background: theme.cardBg, 
                  border: `1px solid ${theme.border}`, 
                  padding: '20px', 
                  borderRadius: '8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#4dabf7'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
              >
                <h3 style={{ margin: '0 0 6px 0', color: '#4dabf7', fontSize: '18px' }}>{setor.nome}</h3>
                <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>{setor.descricao}</p>
              </div>
            ))}
          </div>

          <button 
            onClick={() => signOut(auth)} 
            style={{ marginTop: '30px', background: 'transparent', border: '1px solid #dc3545', color: '#dc3545', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            Encerrar Sessão (Sair)
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

  // SEPARAÇÃO HIERÁRQUICA: ESPECIALISTAS (1) ACIMA, NOC N3 (2) NO MEIO, N1 (3) ABAIXO
  const classificarNivelResponsavel = (nomeResp) => {
    const nomeU = (nomeResp || '').toUpperCase();
    if (nomeU.includes('GILVAN') || nomeU.includes('STEVAN')) return 1; 
    if (nomeU.includes('GUSTAVO')) return 2; 
    return 3; 
  };

  const tarefasEspecialistas = tarefasFiltradas.filter(t => classificarNivelResponsavel(t.responsavel) === 1);
  const tarefasN3 = tarefasFiltradas.filter(t => classificarNivelResponsavel(t.responsavel) === 2);
  const tarefasN1 = tarefasFiltradas.filter(t => classificarNivelResponsavel(t.responsavel) === 3);

  // TELA DE AUDITORIA EXCLUSIVA DO GESTOR COM OPÇÕES DE APAGAR LOGS
  if (paginaAtual === 'auditoria' && isGestor) {
    return (
      <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '15px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <button 
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    setPaginaAtual('andamento');
                  }
                }} 
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                ← Voltar Página
              </button>
              <span style={{ fontSize: '13px', color: '#ffc107', fontWeight: 'bold' }}>[Menu do Gestor - Auditoria de Alterações]</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
              Gestor: <strong>{nomeFormatadoGlobal}</strong> ({setorAtualInfo.nome})
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
            </button>
            <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Sair</button>
          </div>
        </header>

        <div style={{ background: theme.cardBg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '15px' }}>
            <div>
              <h3 style={{ margin: '0 0 6px 0', color: '#ffc107', fontSize: '18px' }}>🔍 Histórico de Modificações e Prazos Alterados</h3>
              <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
                Aqui são registradas todas as ações, criações, edições, resoluções e alterações de datas feitas pelos usuários neste setor.
              </p>
            </div>
            {logsAuditoria.length > 0 && (
              <button 
                onClick={apagarTodoHistoricoAuditoria}
                style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
              >
                🗑️ Apagar Todo o Histórico
              </button>
            )}
          </div>

          {logsAuditoria.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '60px 0' }}>Nenhum registro de alteração neste setor ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {logsAuditoria.map((log) => (
                <div key={log.id} style={{ background: theme.cardInner, padding: '15px', borderRadius: '6px', border: `1px solid ${theme.border}`, borderLeft: log.acao === 'RESOLUÇÃO' ? '4px solid #28a745' : '4px solid #ffc107', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ background: log.acao === 'RESOLUÇÃO' ? '#28a745' : '#ffc107', color: log.acao === 'RESOLUÇÃO' ? '#fff' : '#000', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{log.acao}</span>
                      <strong style={{ fontSize: '14px', color: theme.textMain }}>{log.tarefaTitulo}</strong>
                    </div>
                    <div style={{ fontSize: '13px', color: '#4dabf7', marginBottom: '6px' }}>
                      👤 Usuário: <strong>{log.usuario}</strong>
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      📝 Detalhes: {corrigirDatasNoTexto(log.detalhes)}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%', gap: '10px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
                      🕒 {log.dataHoraFormatada}
                    </div>
                    <button 
                      onClick={() => excluirLogIndividual(log.id)}
                      style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#ff6b6b', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                    >
                      Excluir Registro
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

  // TELA INTERNA DE TAREFAS RESOLVIDAS
  if (paginaAtual === 'resolvidas') {
    return (
      <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '15px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <button 
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    setPaginaAtual('andamento');
                  }
                }} 
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                ← Voltar Página
              </button>
              <span style={{ fontSize: '13px', color: '#28a745', fontWeight: 'bold' }}>[{setorAtualInfo.nome} - Resolvidas]</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
              Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isGestor && (
              <button 
                onClick={() => setPaginaAtual('auditoria')}
                style={{ background: theme.cardBg, border: '1px solid #ffc107', color: '#ffc107', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                🛡️ Menu Auditoria
              </button>
            )}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
            </button>
            <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Sair</button>
          </div>
        </header>

        <div style={{ background: theme.cardBg, padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#28a745', fontSize: '18px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>✅ Tarefas Resolvidas ({tarefasResolvidas.length})</h3>

          {tarefasResolvidas.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '60px 0' }}>Nenhuma tarefa resolvida neste setor ainda.</p>
          ) : (
            <div className="cards-container-grid">
              {tarefasResolvidas.map((t) => {
                return (
                  <div key={t.id} style={{ background: theme.cardInner, padding: '16px', borderRadius: '6px', borderLeft: '4px solid #28a745', border: `1px solid ${theme.border}`, borderLeftWidth: '4px', opacity: 0.9, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', width: '100%' }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: theme.textMuted, wordBreak: 'break-word', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{t.titulo}</span>
                        <span style={{ fontSize: '11px', color: '#28a745', fontWeight: 'bold' }}>(Resolvido)</span>
                      </h4>
                      {t.descricao && (
                        <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: theme.textMuted, lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {t.descricao}
                        </p>
                      )}
                      {t.detalhesResolucao && (
                        <div style={{ background: darkMode ? '#1e2922' : '#e6f4ea', padding: '8px 10px', borderRadius: '4px', marginBottom: '12px', borderLeft: '3px solid #28a745' }}>
                          <span style={{ fontSize: '11px', color: '#28a745', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>Detalhes da Resolução:</span>
                          <p style={{ margin: 0, fontSize: '12px', color: theme.textMain, wordBreak: 'break-word' }}>{t.detalhesResolucao}</p>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
                      <span>👤 <strong style={{ color: '#4dabf7' }}>{t.responsavel}</strong></span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {isGestor && (
                          <button 
                            onClick={() => reabrirTarefa(t)}
                            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#ffc107', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            🔄 Reabrir
                          </button>
                        )}
                        {isGestor && (
                          <button 
                            onClick={() => excluirTarefa(t.id, t.titulo)}
                            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#ff6b6b', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // TELA PRINCIPAL DE ANDAMENTO
  return (
    <div className="app-container" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '15px', fontFamily: 'sans-serif', boxSizing: 'border-box', position: 'relative' }}>
      
      {/* POP-UP DE ALERTA DE TAREFAS CRÍTICAS AO LOGAR */}
      {mostrarPopupAlerta && tarefasUrgentesUsuario.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, padding: '25px', borderRadius: '10px', width: '100%', maxWidth: '520px', border: '2px solid #ff4d4d', boxShadow: '0 8px 30px rgba(255, 77, 77, 0.3)', boxSizing: 'border-box', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🚨</div>
            <h2 style={{ margin: '0 0 10px 0', color: '#ff4d4d', fontSize: '20px' }}>Atenção, {nomeFormatadoGlobal}!</h2>
            <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '20px', lineHeight: '1.5' }}>
              Você possui <strong>{tarefasUrgentesUsuario.length}</strong> tarefa(s) sob sua responsabilidade que está(ão) com prazo crítico ou vencida(s):
            </p>

            <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
              {tarefasUrgentesUsuario.map(t => {
                const st = calcularStatusPrazo(t.prazo);
                return (
                  <div key={t.id} style={{ background: theme.cardInner, padding: '12px 15px', borderRadius: '6px', borderLeft: '4px solid #ff4d4d', border: `1px solid ${theme.border}`, borderLeftWidth: '4px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: theme.textMain, marginBottom: '4px' }}>{t.titulo}</div>
                    <div style={{ fontSize: '12px', color: '#ff4d4d', fontWeight: 'bold' }}>📅 {st.texto}</div>
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => setMostrarPopupAlerta(false)}
              style={{ width: '100%', padding: '12px', background: '#ff4d4d', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
            >
              Entendido, acessar painel
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            {isGestor && (
              <button 
                onClick={() => setSetorSelecionado(null)} 
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
              >
                ← Trocar Setor
              </button>
            )}
            <span style={{ fontSize: '13px', color: '#4dabf7', fontWeight: 'bold' }}>[{setorAtualInfo.nome}]</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
            Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          {isGestor && (
            <button 
              onClick={() => setPaginaAtual('auditoria')}
              style={{ background: theme.cardBg, border: '1px solid #ffc107', color: '#ffc107', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              🛡️ Menu Auditoria
            </button>
          )}

          {pendenciasUrgentesCount > 0 && (
            <div style={{ background: '#ff4d4d', color: '#fff', padding: '8px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
              ⚠️ {pendenciasUrgentesCount} Tarefa(s) Vencida(s) ou Próximas do Vencimento!
            </div>
          )}
          
          <button 
            onClick={() => setPaginaAtual('resolvidas')}
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#28a745', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
          >
            ✅ Tarefas Resolvidas ({tarefasResolvidas.length})
          </button>

          <button 
            onClick={() => setDarkMode(!darkMode)}
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>

          <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Sair</button>
        </div>
      </header>

      {/* GRID DO COMPUTADOR E CELULAR */}
      <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '20px', alignItems: 'start', width: '100%', boxSizing: 'border-box' }}>
        
        {/* COLUNA ESQUERDA: CADASTRAR TAREFA */}
        <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ margin: '0 0 20px 0', color: theme.textMain, fontSize: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>➕ Nova Tarefa de Longo Prazo</h3>
          
          <form onSubmit={adicionarTarefa}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Título da Tarefa *</label>
              <input 
                type="text" 
                placeholder="Ex: Atualização geral dos switches do POP" 
                value={titulo} 
                onChange={(e) => setTitulo(e.target.value)} 
                required 
                style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Descrição / Detalhes</label>
              <textarea 
                placeholder="Contexto, dependências ou motivo..." 
                rows="4"
                value={descricao} 
                onChange={(e) => setDescription(e.target.value)} 
                style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }} 
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>
                {isGestor ? 'Responsável (Escolher Colaborador)' : 'Responsável (Automático)'}
              </label>
              {isGestor ? (
                <select 
                  value={responsavelSelecionadoGestor} 
                  onChange={(e) => setResponsavelSelecionadoGestor(e.target.value)} 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontWeight: 'bold' }}
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
                  style={{ width: '100%', padding: '10px', background: darkMode ? '#252525' : '#e9ecef', border: `1px solid ${theme.border}`, color: '#4dabf7', borderRadius: '4px', boxSizing: 'border-box', fontWeight: 'bold', cursor: 'not-allowed' }} 
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Data Limite (Prazo) *</label>
                <input 
                  type="date" 
                  value={prazo} 
                  onChange={(e) => setPrazo(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box' }} 
                />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Prioridade</label>
                <select 
                  value={prioridade} 
                  onChange={(e) => setPrioridade(e.target.value)} 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box' }}
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>
            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>
              Salvar Tarefa no Painel
            </button>
          </form>
        </div>

        {/* COLUNA DIREITA: LISTAGEM DE TAREFAS */}
        <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, color: theme.textMain, fontSize: '16px' }}>📋 Tarefas e Pendências em Andamento</h3>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
                <option value="todos">Responsável: Todos</option>
                {integrantesAtuais.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {tarefasFiltradas.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '60px 0' }}>Nenhuma tarefa em andamento encontrada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
              
              {/* 1. SEÇÃO DE ESPECIALISTAS (ACIMA) */}
              {tarefasEspecialistas.length > 0 && (
                <div style={{ background: theme.cardInner, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#ffc107', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #ffc107', paddingBottom: '6px' }}>
                    ⭐ Especialistas ({tarefasEspecialistas.length})
                  </h4>
                  <div className="cards-container-grid">
                    {tarefasEspecialistas.map(t => renderizarCardTarefa(t))}
                  </div>
                </div>
              )}

              {/* 2. SEÇÃO DE NOC N3 (NO MEIO) */}
              {tarefasN3.length > 0 && (
                <div style={{ background: theme.cardInner, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#4dabf7', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #4dabf7', paddingBottom: '6px' }}>
                    🔷 NOC N3 ({tarefasN3.length})
                  </h4>
                  <div className="cards-container-grid">
                    {tarefasN3.map(t => renderizarCardTarefa(t))}
                  </div>
                </div>
              )}

              {/* 3. SEÇÃO DE N1 (ABAIXO) */}
              {tarefasN1.length > 0 && (
                <div style={{ background: theme.cardInner, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#20c997', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #20c997', paddingBottom: '6px' }}>
                    🟢 N1 ({tarefasN1.length})
                  </h4>
                  <div className="cards-container-grid">
                    {tarefasN1.map(t => renderizarCardTarefa(t))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* MODAL DE EDIÇÃO */}
      {tarefaEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, padding: '25px', borderRadius: '8px', width: '100%', maxWidth: '450px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#4dabf7', fontSize: '18px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px' }}>✏️ Editar Tarefa</h3>
            
            <form onSubmit={salvarEdicaoTarefa}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Título *</label>
                <input 
                  type="text" 
                  value={editTitulo} 
                  onChange={(e) => setEditTitulo(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box' }} 
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Descrição / Detalhes</label>
                <textarea 
                  rows="3"
                  value={editDescricao} 
                  onChange={(e) => setEditDescricao(e.target.value)} 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '25px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Prazo *</label>
                  <input 
                    type="date" 
                    value={editPrazo} 
                    onChange={(e) => setEditPrazo(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box' }} 
                  />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Prioridade</label>
                  <select 
                    value={editPrioridade} 
                    onChange={(e) => setEditPrioridade(e.target.value)} 
                    style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box' }}
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Crítica">Crítica</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setTarefaEditando(null)}
                  style={{ flex: 1, padding: '10px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '10px', background: '#007bff', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE RESOLUÇÃO DA TAREFA */}
      {tarefaResolvendo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, padding: '25px', borderRadius: '8px', width: '100%', maxWidth: '450px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#28a745', fontSize: '18px' }}>✔ Resolver Tarefa</h3>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '20px' }}>
              Informe o relato ou os detalhes de como a tarefa foi resolvida: <strong>{tarefaResolvendo.titulo}</strong>
            </p>
            
            <form onSubmit={confirmarResolucaoTarefa}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Relato / Detalhes da Resolução *</label>
                <textarea 
                  rows="4"
                  placeholder="Ex: Enlace estabilizado após substituição do SFP na ponta A."
                  value={detalhesResolucaoInput} 
                  onChange={(e) => setDetalhesResolucaoInput(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setTarefaResolvendo(null)}
                  style={{ flex: 1, padding: '10px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '10px', background: '#28a745', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Confirmar Resolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );

  // FUNÇÃO AUXILIAR PARA RENDERIZAR CADA CARD DE TAREFA
  function renderizarCardTarefa(t) {
    const infoPrazo = calcularStatusPrazo(t.prazo);
    const isResponsavelPelaTarefa = nomeFormatadoGlobal.includes(t.responsavel.toUpperCase());
    const podeAgerir = isGestor || isResponsavelPelaTarefa;
    const isUrgente = infoPrazo.status === 'vencido' || infoPrazo.status === 'hoje' || infoPrazo.status === 'um_dia';

    return (
      <div key={t.id} className={`card-tarefa-item ${isUrgente ? 'card-piscando' : ''}`} style={{ background: theme.cardBg, padding: '16px', borderRadius: '6px', border: `1px solid ${theme.border}`, borderLeft: isUrgente ? undefined : `4px solid #007bff`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', width: '100%' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '15px', color: theme.textMain, wordBreak: 'break-word' }}>
              {t.titulo}
            </h4>
            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: t.prioridade === 'Crítica' ? '#b02a37' : t.prioridade === 'Alta' ? '#dc3545' : '#333', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {t.prioridade}
            </span>
          </div>

          {t.descricao && (
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: theme.textMuted, lineHeight: '1.4', wordBreak: 'break-word' }}>
              {t.descricao}
            </p>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '10px', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
            <div>
              👤 <strong style={{ color: '#4dabf7' }}>{t.responsavel}</strong>
            </div>
            <div>
              <span className={isUrgente ? 'alerta-vencido' : ''} style={{ color: infoPrazo.status === 'normal' ? theme.textMuted : undefined }}>
                📅 {infoPrazo.texto}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
            {podeAgerir && (
              <button 
                onClick={() => abrirModalEdicao(t)}
                style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: '#4dabf7', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
              >
                ✏️ Editar
              </button>
            )}

            {podeAgerir && (
              <button 
                onClick={() => abrirModalResolucao(t)}
                style={{ background: '#28a745', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
              >
                ✔ Resolver
              </button>
            )}
            
            {isGestor && (
              <button 
                onClick={() => excluirTarefa(t.id, t.titulo)}
                style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: '#ff6b6b', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
              >
                Excluir
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
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
      setMensagemSucesso("Senha alterada com sucesso! Você já pode entrar com a nova senha.");
      setSenha('');
      setSenhaNova('');
      setAlterarSenhaMode(false);
    } catch (e) {
      setErro("Erro ao alterar senha: Verifique se o e-mail e a senha atual estão corretos.");
    }
  };

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', boxSizing: 'border-box', padding: '15px', position: 'relative' }}>
      <button 
        onClick={() => setDarkMode(!darkMode)}
        style={{ position: 'absolute', top: '15px', right: '15px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
      >
        {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
      </button>

      <form onSubmit={alterarSenhaMode ? handleAlterarSenha : handleLogin} style={{ background: theme.cardBg, padding: '30px 20px', borderRadius: '8px', width: '100%', maxWidth: '380px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
        
        {/* LOGO DA PASTA PUBLIC (logo.png) COM ORDEM NOC • NMR • NIIP */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img 
            src="/logo.png" 
            alt="Logo Fibralink" 
            style={{ maxWidth: '190px', maxHeight: '65px', height: 'auto', objectFit: 'contain', display: 'inline-block', marginBottom: '5px' }} 
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <span style={{ fontSize: '12px', color: '#4dabf7', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>Sistema Integrado</span>
          <p style={{ margin: 0, color: theme.textMuted, fontSize: '11px' }}>NOC • NMR • NIIP</p>
        </div>

        {erro && <p style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '15px', background: darkMode ? '#2d1a1a' : '#f8d7da', padding: '8px', borderRadius: '4px' }}>{erro}</p>}
        {mensagemSucesso && <p style={{ color: '#28a745', fontSize: '12px', marginBottom: '15px', background: darkMode ? '#1a2d1a' : '#d4edda', padding: '8px', borderRadius: '4px' }}>{mensagemSucesso}</p>}
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: theme.textMuted }}>E-mail da Equipe</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@fibralink.net.br" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: theme.textMuted }}>
            {alterarSenhaMode ? 'Senha Atual' : 'Senha'}
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={mostrarSenha ? 'text' : 'password'} 
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              required 
              style={{ width: '100%', padding: '10px', paddingRight: '40px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box' }} 
            />
            <button 
              type="button" 
              onClick={() => setMostrarSenha(!mostrarSenha)} 
              style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: theme.textMuted }}
              title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            >
              {mostrarSenha ? '👁️' : '🔒'}
            </button>
          </div>
        </div>

        {alterarSenhaMode && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: theme.textMuted }}>Nova Senha</label>
            <input type={mostrarSenha ? 'text' : 'password'} value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, boxSizing: 'border-box' }} />
          </div>
        )}

        <button type="submit" style={{ width: '100%', padding: '12px', background: '#007bff', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}>
          {alterarSenhaMode ? 'Atualizar para Nova Senha' : 'Entrar no Sistema'}
        </button>

        <div style={{ textAlign: 'center' }}>
          <button 
            type="button" 
            onClick={() => { setAlterarSenhaMode(!alterarSenhaMode); setErro(''); setMensagemSucesso(''); }}
            style={{ background: 'transparent', border: 'none', color: '#4dabf7', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
          >
            {alterarSenhaMode ? '← Voltar para o Login' : 'Alterar minha senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
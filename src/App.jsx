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
  updateDoc
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
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    padding: 0;
    overflow-x: hidden;
  }
`;
document.head.appendChild(style);

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
    id: 'niip', 
    nome: 'NIIP - Núcleo de Informática e Inspeção de POPs', 
    descricao: 'Gestão de tarefas, prazos e manutenções da infraestrutura de POPs.'
  },
  { 
    id: 'noc', 
    nome: 'NOC - Network Operations Center', 
    descricao: 'Monitoramento de rede, incidentes e controle de enlaces.'
  },
  { 
    id: 'nmr', 
    nome: 'NMR - Núcleo de Monitoramento', 
    descricao: 'Acompanhamento de alertas, métricas e supervisão contínua.'
  }
];

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [setorSelecionado, setSetorSelecionado] = useState(null);
  const [paginaAtual, setPaginaAtual] = useState('andamento'); // 'andamento' ou 'resolvidas'
  const [darkMode, setDarkMode] = useState(true);
  
  const [tarefas, setTarefas] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescription] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('Média');
  
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');

  // Estados do Modal de Edição
  const [tarefaEditando, setTarefaEditando] = useState(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editPrazo, setEditPrazo] = useState('');
  const [editPrioridade, setEditPrioridade] = useState('');

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
      return () => unsub();
    }
  }, [usuarioLogado, setorSelecionado, nomeFormatadoGlobal, popupJaExibido]);
  
  const obterIntegrantesSetor = () => {
    if (setorSelecionado === 'noc') return INTEGRANTES_NOC;
    if (setorSelecionado === 'nmr') return INTEGRANTES_NMR;
    return INTEGRANTES_NIIP;
  };

  const integrantesAtuais = obterIntegrantesSetor();
  const responsavelAutomatico = integrantesAtuais.find(n => nomeFormatadoGlobal.includes(n.toUpperCase())) || integrantesAtuais[0] || 'Gestor';

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
      responsavel: responsavelAutomatico,
      prazo,
      prioridade,
      status: 'Pendente',
      criadoPor: nomeFormatadoGlobal,
      criadoEm: Date.now()
    };

    try {
      await setDoc(doc(db, `${setorSelecionado}_tarefas`, novaTarefaId), tarefaObj);
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
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefaEditando.id), {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim(),
        prazo: editPrazo,
        prioridade: editPrioridade
      });
      setTarefaEditando(null);
      alert("Tarefa atualizada com sucesso!");
    } catch (err) {
      alert("Erro ao atualizar tarefa: " + err.message);
    }
  };

  const resolverTarefa = async (tarefa) => {
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefa.id), { status: 'Resolvida' });
    } catch (err) {
      alert("Erro ao resolver tarefa: " + err.message);
    }
  };

  const reabrirTarefa = async (tarefa) => {
    try {
      await updateDoc(doc(db, `${setorSelecionado}_tarefas`, tarefa.id), { status: 'Pendente' });
    } catch (err) {
      alert("Erro ao reabrir tarefa: " + err.message);
    }
  };

  const excluirTarefa = async (id) => {
    if (window.confirm("Deseja realmente excluir esta tarefa do painel?")) {
      try {
        await deleteDoc(doc(db, `${setorSelecionado}_tarefas`, id));
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
    return <div style={{ color: theme.textMain, backgroundColor: theme.bg, textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif', minHeight: '100vh', padding: '20px' }}>Carregando sistema...</div>;
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={setDarkMode} theme={theme} />;
  }

  const isGestor = nomeFormatadoGlobal.includes('DUANDYS');
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
      <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', padding: '15px', position: 'relative' }}>
        <button 
          onClick={() => setDarkMode(!darkMode)}
          style={{ position: 'absolute', top: '15px', right: '15px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
        >
          {darkMode ? '☀️ Claro' : '🌙 Escuro'}
        </button>

        <div style={{ maxWidth: '650px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', color: '#4dabf7', marginBottom: '8px' }}>Selecione o Setor</h1>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '25px' }}>Painel do Gestor - Escolha qual núcleo deseja administrar:</p>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            {SETORES_DISPONIVEIS.map(setor => (
              <div 
                key={setor.id} 
                onClick={() => { setSetorSelecionado(setor.id); setPaginaAtual('andamento'); }}
                style={{ 
                  background: theme.cardBg, 
                  border: `1px solid ${theme.border}`, 
                  padding: '16px', 
                  borderRadius: '8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <h3 style={{ margin: '0 0 4px 0', color: '#4dabf7', fontSize: '16px' }}>{setor.nome}</h3>
                <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>{setor.descricao}</p>
              </div>
            ))}
          </div>

          <button 
            onClick={() => signOut(auth)} 
            style={{ marginTop: '25px', background: 'transparent', border: '1px solid #dc3545', color: '#dc3545', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
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

  // TELA INTERNA DE TAREFAS RESOLVIDAS
  if (paginaAtual === 'resolvidas') {
    return (
      <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '15px', fontFamily: 'sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setPaginaAtual('andamento')} 
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
              >
                ← Voltar
              </button>
              <span style={{ fontSize: '12px', color: '#28a745', fontWeight: 'bold' }}>[{setorAtualInfo.nome} - Resolvidas]</span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
              Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 10px', borderRadius: '15px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Sair</button>
          </div>
        </header>

        <div style={{ background: theme.cardBg, padding: '16px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#28a745', fontSize: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>✅ Tarefas Resolvidas ({tarefasResolvidas.length})</h3>

          {tarefasResolvidas.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Nenhuma tarefa resolvida neste setor ainda.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', width: '100%' }}>
              {tarefasResolvidas.map((t) => {
                const isResponsavelPelaTarefa = nomeFormatadoGlobal.includes(t.responsavel.toUpperCase());
                const podeAgerir = isGestor || isResponsavelPelaTarefa;

                return (
                  <div key={t.id} style={{ background: theme.cardInner, padding: '14px', borderRadius: '6px', border: `1px solid ${theme.border}`, borderLeft: '4px solid #28a745', opacity: 0.9, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: theme.textMuted, textDecoration: 'line-through', wordBreak: 'break-word' }}>
                        {t.titulo}
                      </h4>
                      {t.descricao && (
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: theme.textMuted, lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {t.descricao}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <span>👤 <strong style={{ color: '#4dabf7' }}>{t.responsavel}</strong></span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {podeAgerir && (
                          <button 
                            onClick={() => reabrirTarefa(t)}
                            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#ffc107', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                          >
                            🔄 Reabrir
                          </button>
                        )}
                        {isGestor && (
                          <button 
                            onClick={() => excluirTarefa(t.id)}
                            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#ff6b6b', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
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
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '15px', fontFamily: 'sans-serif', position: 'relative' }}>
      
      {/* POP-UP DE ALERTA DE TAREFAS CRÍTICAS AO LOGAR */}
      {mostrarPopupAlerta && tarefasUrgentesUsuario.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px' }}>
          <div style={{ background: theme.cardBg, padding: '24px', borderRadius: '10px', width: '100%', maxWidth: '480px', border: '2px solid #ff4d4d', boxShadow: '0 8px 30px rgba(255, 77, 77, 0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚨</div>
            <h2 style={{ margin: '0 0 8px 0', color: '#ff4d4d', fontSize: '18px' }}>Atenção, {nomeFormatadoGlobal}!</h2>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px', lineHeight: '1.4' }}>
              Você possui <strong>{tarefasUrgentesUsuario.length}</strong> tarefa(s) sob sua responsabilidade com prazo crítico ou vencida(s):
            </p>

            <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
              {tarefasUrgentesUsuario.map(t => {
                const st = calcularStatusPrazo(t.prazo);
                return (
                  <div key={t.id} style={{ background: theme.cardInner, padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, borderLeft: '4px solid #ff4d4d' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: theme.textMain, marginBottom: '2px' }}>{t.titulo}</div>
                    <div style={{ fontSize: '11px', color: '#ff4d4d', fontWeight: 'bold' }}>📅 {st.texto}</div>
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => setMostrarPopupAlerta(false)}
              style={{ width: '100%', padding: '11px', background: '#ff4d4d', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            >
              Entendido, acessar painel
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            {isGestor && (
              <button 
                onClick={() => setSetorSelecionado(null)} 
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
              >
                ← Trocar Setor
              </button>
            )}
            <span style={{ fontSize: '12px', color: '#4dabf7', fontWeight: 'bold' }}>[{setorAtualInfo.nome}]</span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>
            Usuário: <strong>{nomeFormatadoGlobal}</strong> ({tipoCargo})
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {pendenciasUrgentesCount > 0 && (
            <div style={{ background: '#ff4d4d', color: '#fff', padding: '6px 10px', borderRadius: '15px', fontSize: '11px', fontWeight: 'bold' }}>
              ⚠️ {pendenciasUrgentesCount} Urgentes
            </div>
          )}
          
          <button 
            onClick={() => setPaginaAtual('resolvidas')}
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#28a745', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
          >
            ✅ ({tarefasResolvidas.length})
          </button>

          <button 
            onClick={() => setDarkMode(!darkMode)}
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '7px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>

          <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Sair</button>
        </div>
      </header>

      {/* GRID RESPONSIVO MOBILE / DESKTOP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', width: '100%' }}>
        
        {/* COLUNA ESQUERDA: CADASTRAR TAREFA */}
        <div style={{ background: theme.cardBg, padding: '16px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%' }}>
          <h3 style={{ margin: '0 0 16px 0', color: theme.textMain, fontSize: '15px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>➕ Nova Tarefa</h3>
          
          <form onSubmit={adicionarTarefa}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Título da Tarefa *</label>
              <input 
                type="text" 
                placeholder="Ex: Atualização geral dos switches" 
                value={titulo} 
                onChange={(e) => setTitulo(e.target.value)} 
                required 
                style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} 
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Descrição / Detalhes</label>
              <textarea 
                placeholder="Contexto, dependências ou motivo..." 
                rows="3"
                value={descricao} 
                onChange={(e) => setDescription(e.target.value)} 
                style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px', resize: 'vertical' }} 
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Responsável (Automático)</label>
              <input 
                type="text" 
                value={responsavelAutomatico} 
                disabled 
                style={{ width: '100%', padding: '10px', background: darkMode ? '#252525' : '#e9ecef', border: `1px solid ${theme.border}`, color: '#4dabf7', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'not-allowed' }} 
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 130px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Data Limite *</label>
                <input 
                  type="date" 
                  value={prazo} 
                  onChange={(e) => setPrazo(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} 
                />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Prioridade</label>
                <select 
                  value={prioridade} 
                  onChange={(e) => setPrioridade(e.target.value)} 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }}
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>
            </div>

            <button type="submit" style={{ width: '100%', padding: '11px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Salvar Tarefa no Painel
            </button>
          </form>
        </div>

        {/* COLUNA DIREITA: LISTAGEM DE TAREFAS */}
        <div style={{ background: theme.cardBg, padding: '16px', borderRadius: '8px', border: `1px solid ${theme.border}`, width: '100%' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: theme.textMain, fontSize: '15px' }}>📋 Tarefas em Andamento</h3>
            
            <div style={{ width: '100%', maxWidth: '200px' }}>
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}>
                <option value="todos">Resp: Todos</option>
                {integrantesAtuais.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {tarefasFiltradas.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Nenhuma tarefa em andamento encontrada.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', width: '100%' }}>
              {tarefasFiltradas.map((t) => {
                const infoPrazo = calcularStatusPrazo(t.prazo);
                const isResponsavelPelaTarefa = nomeFormatadoGlobal.includes(t.responsavel.toUpperCase());
                const podeAgerir = isGestor || isResponsavelPelaTarefa;

                const isUrgente = infoPrazo.status === 'vencido' || infoPrazo.status === 'hoje' || infoPrazo.status === 'um_dia';

                return (
                  <div key={t.id} className={isUrgente ? 'card-piscando' : ''} style={{ background: theme.cardInner, padding: '14px', borderRadius: '6px', border: `1px solid ${theme.border}`, borderLeft: isUrgente ? undefined : `4px solid #007bff`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '6px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', color: theme.textMain, wordBreak: 'break-word' }}>
                          {t.titulo}
                        </h4>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: t.prioridade === 'Crítica' ? '#b02a37' : t.prioridade === 'Alta' ? '#dc3545' : '#333', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          {t.prioridade}
                        </span>
                      </div>

                      {t.descricao && (
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: theme.textMuted, lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {t.descricao}
                        </p>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, paddingTop: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          👤 <strong style={{ color: '#4dabf7' }}>{t.responsavel}</strong>
                        </div>
                        <div>
                          <span className={isUrgente ? 'alerta-vencido' : ''} style={{ color: infoPrazo.status === 'normal' ? theme.textMuted : undefined }}>
                            📅 {infoPrazo.texto}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                        {podeAgerir && (
                          <button 
                            onClick={() => abrirModalEdicao(t)}
                            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#4dabf7', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            ✏️ Editar
                          </button>
                        )}

                        {podeAgerir && (
                          <button 
                            onClick={() => resolverTarefa(t)}
                            style={{ background: '#28a745', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            ✔ Resolver
                          </button>
                        )}
                        
                        {isGestor && (
                          <button 
                            onClick={() => excluirTarefa(t.id)}
                            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: '#ff6b6b', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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

      {/* MODAL DE EDIÇÃO */}
      {tarefaEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px' }}>
          <div style={{ background: theme.cardBg, padding: '20px', borderRadius: '8px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}` }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#4dabf7', fontSize: '16px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>✏️ Editar Tarefa</h3>
            
            <form onSubmit={salvarEdicaoTarefa}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Título *</label>
                <input 
                  type="text" 
                  value={editTitulo} 
                  onChange={(e) => setEditTitulo(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} 
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Descrição / Detalhes</label>
                <textarea 
                  rows="3"
                  value={editDescricao} 
                  onChange={(e) => setEditDescricao(e.target.value)} 
                  style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px', resize: 'vertical' }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Prazo *</label>
                  <input 
                    type="date" 
                    value={editPrazo} 
                    onChange={(e) => setEditPrazo(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }} 
                  />
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Prioridade</label>
                  <select 
                    value={editPrioridade} 
                    onChange={(e) => setEditPrioridade(e.target.value)} 
                    style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '13px' }}
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
                  style={{ flex: 1, padding: '10px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: '10px', background: '#007bff', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  Salvar
                </button>
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
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', position: 'relative' }}>
      <button 
        onClick={() => setDarkMode(!darkMode)}
        style={{ position: 'absolute', top: '15px', right: '15px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
      >
        {darkMode ? '☀️ Claro' : '🌙 Escuro'}
      </button>

      <form onSubmit={alterarSenhaMode ? handleAlterarSenha : handleLogin} style={{ background: theme.cardBg, padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '340px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', border: `1px solid ${theme.border}` }}>
        <h2 style={{ textAlign: 'center', marginBottom: '4px', color: '#4dabf7', fontSize: '18px' }}>Sistema Integrado</h2>
        <p style={{ textAlign: 'center', color: theme.textMuted, fontSize: '11px', marginBottom: '20px' }}>NIIP • NOC • NMR</p>
        
        {erro && <p style={{ color: '#ff6b6b', fontSize: '11px', marginBottom: '12px', background: darkMode ? '#2d1a1a' : '#f8d7da', padding: '8px', borderRadius: '4px' }}>{erro}</p>}
        {mensagemSucesso && <p style={{ color: '#28a745', fontSize: '11px', marginBottom: '12px', background: darkMode ? '#1a2d1a' : '#d4edda', padding: '8px', borderRadius: '4px' }}>{mensagemSucesso}</p>}
        
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: theme.textMuted }}>E-mail da Equipe</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@exemplo.com" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, fontSize: '13px' }} />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: theme.textMuted }}>
            {alterarSenhaMode ? 'Senha Atual' : 'Senha'}
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={mostrarSenha ? 'text' : 'password'} 
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              required 
              style={{ width: '100%', padding: '10px', paddingRight: '40px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, fontSize: '13px' }} 
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
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: theme.textMuted }}>Nova Senha</label>
            <input type={mostrarSenha ? 'text' : 'password'} value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, fontSize: '13px' }} />
          </div>
        )}

        <button type="submit" style={{ width: '100%', padding: '11px', background: '#007bff', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', marginBottom: '12px', fontSize: '13px' }}>
          {alterarSenhaMode ? 'Atualizar Senha' : 'Entrar no Sistema'}
        </button>

        <div style={{ textAlign: 'center' }}>
          <button 
            type="button" 
            onClick={() => { setAlterarSenhaMode(!alterarSenhaMode); setErro(''); setMensagemSucesso(''); }}
            style={{ background: 'transparent', border: 'none', color: '#4dabf7', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
          >
            {alterarSenhaMode ? '← Voltar para o Login' : 'Alterar minha senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
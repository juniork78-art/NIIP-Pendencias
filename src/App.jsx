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
  .alerta-hoje {
    color: #ff9800 !important;
    font-weight: bold;
  }
`;
document.head.appendChild(style);

const calcularStatusPrazo = (dataStr) => {
  if (!dataStr) return { status: 'normal', texto: '' };
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

      if (diffDays < 0) return { status: 'vencido', texto: `Vencido há ${Math.abs(diffDays)} dia(s) (${dataFormatada})` };
      if (diffDays === 0) return { status: 'hoje', texto: `Vence HOJE (${dataFormatada})` };
      if (diffDays <= 3) return { status: 'proximo', texto: `Vence em ${diffDays} dia(s) (${dataFormatada})` };
      return { status: 'normal', texto: `Prazo: ${dataFormatada}` };
    }
    return { status: 'normal', texto: '' };
  } catch (e) {
    return { status: 'normal', texto: '' };
  }
};

const INTEGRANTES = ["Francisco", "Gabriel", "Walgney"];

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
  
  const [tarefas, setTarefas] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescription] = useState('');
  const [responsavel, setResponsavel] = useState('Francisco');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('Média');
  
  const [filtroStatus, setFiltroStatus] = useState('todas'); 
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');
  const [mostrarResolvidas, setMostrarResolvidas] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUsuarioLogado(user.email);
        const emailLower = user.email.toLowerCase();
        if (!emailLower.includes('duandys')) {
          setSetorSelecionado('niip');
        }
      } else {
        setUsuarioLogado(null);
        setSetorSelecionado(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (usuarioLogado && setorSelecionado) {
      const unsub = onSnapshot(collection(db, `${setorSelecionado}_tarefas`), (snapshot) => {
        const lista = [];
        snapshot.forEach((docSnap) => {
          lista.push({ id: docSnap.id, ...docSnap.data() });
        });
        lista.sort((a, b) => b.criadoEm - a.criadoEm);
        setTarefas(lista);
      });
      return () => unsub();
    }
  }, [usuarioLogado, setorSelecionado]);

  const adicionarTarefa = async (e) => {
    e.preventDefault();
    if (!titulo.trim() || !prazo) {
      alert("Preencha o título e a data limite da tarefa!");
      return;
    }

    const novaTarefaId = Date.now().toString();
    const nomeUsuarioLogado = usuarioLogado.split('@')[0].replace('.', ' ').toUpperCase();

    const tarefaObj = {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      responsavel,
      prazo,
      prioridade,
      status: 'Pendente',
      criadoPor: nomeUsuarioLogado,
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

  if (loadingAuth) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>Carregando sistema...</div>;
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} />;
  }

  const nomeFormatado = usuarioLogado.split('@')[0].replace('.', ' ').toUpperCase();
  const isGestor = nomeFormatado.includes('DUANDYS');

  if (!setorSelecionado && isGestor) {
    return (
      <div style={{ backgroundColor: '#121212', color: '#fff', minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '650px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: '26px', color: '#4dabf7', marginBottom: '8px' }}>Selecione o Setor</h1>
          <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '30px' }}>Painel do Gestor - Escolha qual núcleo deseja administrar:</p>
          
          <div style={{ display: 'grid', gap: '15px' }}>
            {SETORES_DISPONIVEIS.map(setor => (
              <div 
                key={setor.id} 
                onClick={() => setSetorSelecionado(setor.id)}
                style={{ 
                  background: '#1e1e1e', 
                  border: '1px solid #444', 
                  padding: '20px', 
                  borderRadius: '8px', 
                  textAlign: 'left', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#4dabf7'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#444'}
              >
                <h3 style={{ margin: '0 0 6px 0', color: '#4dabf7', fontSize: '18px' }}>{setor.nome}</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>{setor.descricao}</p>
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
    return st.status === 'vencido' || st.status === 'hoje';
  }).length;

  const tarefasAndamento = tarefas.filter(t => t.status !== 'Resolvida');
  const tarefasResolvidas = tarefas.filter(t => t.status === 'Resolvida');

  const tarefasFiltradas = tarefasAndamento.filter(t => {
    if (filtroStatus === 'pendentes' && t.status !== 'Pendente') return false;
    if (filtroResponsavel !== 'todos' && t.responsavel !== filtroResponsavel) return false;
    return true;
  });

  return (
    <div style={{ backgroundColor: '#121212', color: '#fff', minHeight: '100vh', width: '100%', padding: '24px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            {isGestor && (
              <button 
                onClick={() => setSetorSelecionado(null)} 
                style={{ background: '#333', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
              >
                ← Trocar Setor
              </button>
            )}
            <span style={{ fontSize: '13px', color: '#4dabf7', fontWeight: 'bold' }}>[{setorAtualInfo.nome}]</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>
            Usuário: <strong>{nomeFormatado}</strong> ({isGestor ? 'Gestor' : 'Integrante'})
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          {pendenciasUrgentesCount > 0 && (
            <div style={{ background: '#ff4d4d', color: '#fff', padding: '8px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
              ⚠️ {pendenciasUrgentesCount} Tarefa(s) Vencida(s) ou para Hoje!
            </div>
          )}
          
          <button 
            onClick={() => setMostrarResolvidas(!mostrarResolvidas)}
            style={{ background: '#2b2b2b', border: '1px solid #444', color: '#4dabf7', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
          >
            📂 Tarefas Resolvidas ({tarefasResolvidas.length})
          </button>

          <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '9px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Sair</button>
        </div>
      </header>

      {/* PAINEL DE TAREFAS RESOLVIDAS (MODAL / ABA LATERAL) */}
      {mostrarResolvidas && (
        <div style={{ background: '#181818', border: '1px solid #444', borderRadius: '8px', padding: '20px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#28a745', fontSize: '16px' }}>✅ Histórico de Tarefas Resolvidas</h3>
            <button onClick={() => setMostrarResolvidas(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>✕ Fechar</button>
          </div>

          {tarefasResolvidas.length === 0 ? (
            <p style={{ color: '#777', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Nenhuma tarefa resolvida neste setor ainda.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
              {tarefasResolvidas.map((t) => (
                <div key={t.id} style={{ background: '#222', padding: '14px', borderRadius: '6px', borderLeft: '4px solid #28a745', opacity: 0.85 }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#fff', textDecoration: 'line-through' }}>{t.titulo}</h4>
                  {t.descricao && <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#aaa' }}>{t.descricao}</p>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#888', borderTop: '1px solid #333', paddingTop: '8px' }}>
                    <span>👤 {t.responsavel}</span>
                    <button onClick={() => reabrirTarefa(t)} style={{ background: '#333', border: '1px solid #555', color: '#ffc107', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>Reabrir</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GRID RESPONSIVO SEGURO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 400px) 1fr', gap: '25px', alignItems: 'start', width: '100%', boxSizing: 'border-box' }}>
        
        {/* COLUNA ESQUERDA: CADASTRAR TAREFA */}
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333', width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#fff', fontSize: '16px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>➕ Nova Tarefa de Longo Prazo</h3>
          
          <form onSubmit={adicionarTarefa}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Título da Tarefa *</label>
              <input 
                type="text" 
                placeholder="Ex: Atualização geral dos switches do POP" 
                value={titulo} 
                onChange={(e) => setTitulo(e.target.value)} 
                required 
                style={{ width: '100%', padding: '10px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Descrição / Detalhes</label>
              <textarea 
                placeholder="Contexto, dependências ou motivo..." 
                rows="4"
                value={descricao} 
                onChange={(e) => setDescription(e.target.value)} 
                style={{ width: '100%', padding: '10px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }} 
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Responsável (Integrante)</label>
              <select 
                value={responsavel} 
                onChange={(e) => setResponsavel(e.target.value)} 
                style={{ width: '100%', padding: '10px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}
              >
                {INTEGRANTES.map(nome => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Data Limite (Prazo) *</label>
                <input 
                  type="date" 
                  value={prazo} 
                  onChange={(e) => setPrazo(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '10px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }} 
                />
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Prioridade</label>
                <select 
                  value={prioridade} 
                  onChange={(e) => setPrioridade(e.target.value)} 
                  style={{ width: '100%', padding: '10px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}
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
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333', width: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>📋 Tarefas e Pendências em Andamento</h3>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '8px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '12px' }}>
                <option value="todos">Responsável: Todos</option>
                {INTEGRANTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {tarefasFiltradas.length === 0 ? (
            <p style={{ color: '#777', fontSize: '14px', textAlign: 'center', padding: '60px 0' }}>Nenhuma tarefa em andamento encontrada.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
              {tarefasFiltradas.map((t) => {
                const infoPrazo = calcularStatusPrazo(t.prazo);

                let borderLeftColor = '#007bff';
                if (infoPrazo.status === 'vencido') borderLeftColor = '#ff4d4d';
                else if (infoPrazo.status === 'hoje') borderLeftColor = '#ff9800';

                return (
                  <div key={t.id} style={{ background: '#252525', padding: '16px', borderRadius: '6px', borderLeft: `4px solid ${borderLeftColor}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', color: '#fff', wordBreak: 'break-word' }}>
                          {t.titulo}
                        </h4>
                        <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: t.prioridade === 'Crítica' ? '#b02a37' : t.prioridade === 'Alta' ? '#dc3545' : '#333', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          {t.prioridade}
                        </span>
                      </div>

                      {t.descricao && (
                        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#ccc', lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {t.descricao}
                        </p>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#aaa', borderTop: '1px solid #333', paddingTop: '10px', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          👤 <strong style={{ color: '#4dabf7' }}>{t.responsavel}</strong>
                        </div>
                        <div>
                          <span className={infoPrazo.status === 'vencido' ? 'alerta-vencido' : infoPrazo.status === 'hoje' ? 'alerta-hoje' : ''} style={{ color: infoPrazo.status === 'normal' ? '#aaa' : undefined }}>
                            📅 {infoPrazo.texto}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button 
                          onClick={() => resolverTarefa(t)}
                          style={{ background: '#28a745', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                        >
                          ✔ Resolver
                        </button>
                        
                        <button 
                          onClick={() => excluirTarefa(t.id)}
                          style={{ background: '#333', border: '1px solid #555', color: '#ff6b6b', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

function TelaLogin({ onLoginSucesso }) {
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
    <div style={{ backgroundColor: '#121212', color: '#fff', minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', boxSizing: 'border-box', padding: '20px' }}>
      <form onSubmit={handleLogin} style={{ background: '#1e1e1e', padding: '35px', borderRadius: '8px', width: '100%', maxWidth: '360px', boxShadow: '0 4px 15px rgba(0,0,0,0.6)', border: '1px solid #333', boxSizing: 'border-box' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '5px', color: '#4dabf7', fontSize: '18px' }}>Sistema Integrado</h2>
        <p style={{ textAlign: 'center', color: '#aaa', fontSize: '12px', marginBottom: '25px' }}>NIIP • NOC • NMR</p>
        
        {erro && <p style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '15px', background: '#2d1a1a', padding: '8px', borderRadius: '4px' }}>{erro}</p>}
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#ccc' }}>E-mail da Equipe</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@exemplo.com" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#2d2d2d', color: '#fff', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#ccc' }}>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#2d2d2d', color: '#fff', boxSizing: 'border-box' }} />
        </div>
        <button type="submit" style={{ width: '100%', padding: '12px', background: '#007bff', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>Entrar no Sistema</button>
      </form>
    </div>
  );
}
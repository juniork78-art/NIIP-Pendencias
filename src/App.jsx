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

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [tarefas, setTarefas] = useState([]);
  
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescription] = useState('');
  const [responsavel, setResponsavel] = useState('Francisco');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState('Média');
  
  const [filtroStatus, setFiltroStatus] = useState('todas'); 
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUsuarioLogado(user.email);
      } else {
        setUsuarioLogado(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (usuarioLogado) {
      const unsub = onSnapshot(collection(db, "niip_tarefas"), (snapshot) => {
        const lista = [];
        snapshot.forEach((docSnap) => {
          lista.push({ id: docSnap.id, ...docSnap.data() });
        });
        lista.sort((a, b) => b.criadoEm - a.criadoEm);
        setTarefas(lista);
      });
      return () => unsub();
    }
  }, [usuarioLogado]);

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
      await setDoc(doc(db, "niip_tarefas", novaTarefaId), tarefaObj);
      setTitulo('');
      setDescription('');
      setPrazo('');
      alert("Tarefa de longo prazo cadastrada com sucesso!");
    } catch (err) {
      alert("Erro ao salvar tarefa: " + err.message);
    }
  };

  const alternarStatus = async (tarefa) => {
    const novoStatus = tarefa.status === 'Pendente' ? 'Concluída' : 'Pendente';
    try {
      await updateDoc(doc(db, "niip_tarefas", tarefa.id), { status: novoStatus });
    } catch (err) {
      alert("Erro ao atualizar status: " + err.message);
    }
  };

  const excluirTarefa = async (id) => {
    if (window.confirm("Deseja realmente excluir esta tarefa do painel?")) {
      try {
        await deleteDoc(doc(db, "niip_tarefas", id));
      } catch (err) {
        alert("Erro ao excluir: " + err.message);
      }
    }
  };

  if (loadingAuth) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif' }}>Carregando NIIP - Pendências...</div>;
  }

  if (!usuarioLogado) {
    return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} />;
  }

  const pendenciasUrgentesCount = tarefas.filter(t => {
    if (t.status === 'Concluída') return false;
    const st = calcularStatusPrazo(t.prazo);
    return st.status === 'vencido' || st.status === 'hoje';
  }).length;

  const tarefasFiltradas = tarefas.filter(t => {
    if (filtroStatus === 'pendentes' && t.status !== 'Pendente') return false;
    if (filtroStatus === 'concluidas' && t.status !== 'Concluída') return false;
    if (filtroResponsavel !== 'todos' && t.responsavel !== filtroResponsavel) return false;
    return true;
  });

  const nomeFormatado = usuarioLogado.split('@')[0].replace('.', ' ').toUpperCase();
  const isGestor = nomeFormatado.includes('DUANDYS');

  return (
    <div style={{ backgroundColor: '#121212', color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '20px', color: '#4dabf7' }}>NIIP - Núcleo de Informática e Inspeção de POPs</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>
            Usuário: <strong>{nomeFormatado}</strong> ({isGestor ? 'Gestor' : 'Integrante'})
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {pendenciasUrgentesCount > 0 && (
            <div style={{ background: '#ff4d4d', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
              ⚠️ {pendenciasUrgentesCount} Tarefa(s) Vencida(s) ou para Hoje!
            </div>
          )}
          <button onClick={() => signOut(auth)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sair</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333', height: 'fit-content' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '16px', borderBottom: '1px solid #444', paddingBottom: '8px' }}>➕ Nova Tarefa de Longo Prazo</h3>
          <form onSubmit={adicionarTarefa}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Título da Tarefa *</label>
              <input type="text" placeholder="Ex: Atualização geral dos switches do POP" value={titulo} onChange={(e) => setTitulo(e.target.value)} required style={{ width: '100%', padding: '9px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Descrição / Detalhes</label>
              <textarea placeholder="Contexto, dependências ou motivo..." rows="3" value={descricao} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%', padding: '9px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Responsável (Integrante)</label>
              <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} style={{ width: '100%', padding: '9px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}>
                {INTEGRANTES.map(nome => (<option key={nome} value={nome}>{nome}</option>))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Data Limite (Prazo) *</label>
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} required style={{ width: '100%', padding: '9px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Prioridade</label>
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} style={{ width: '100%', padding: '9px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}>
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>
            </div>
            <button type="submit" style={{ width: '100%', padding: '12px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', marginTop: '5px' }}>Salvar Tarefa no Painel</button>
          </form>
        </div>

        <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>📋 Tarefas e Pendências em Andamento</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={{ padding: '6px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '12px' }}>
                <option value="todas">Status: Todas</option>
                <option value="pendentes">Pendentes</option>
                <option value="concluidas">Concluídas</option>
              </select>
              <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} style={{ padding: '6px', background: '#2d2d2d', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '12px' }}>
                <option value="todos">Responsável: Todos</option>
                {INTEGRANTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {tarefasFiltradas.length === 0 ? (
            <p style={{ color: '#777', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Nenhuma tarefa encontrada com os filtros selecionados.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', overflowY: 'auto' }}>
              {tarefasFiltradas.map((t) => {
                const infoPrazo = calcularStatusPrazo(t.prazo);
                const isConcluida = t.status === 'Concluída';
                let borderLeftColor = '#007bff';
                if (isConcluida) borderLeftColor = '#28a745';
                else if (infoPrazo.status === 'vencido') borderLeftColor = '#ff4d4d';
                else if (infoPrazo.status === 'hoje') borderLeftColor = '#ff9800';

                return (
                  <div key={t.id} style={{ background: '#252525', padding: '14px', borderRadius: '6px', borderLeft: `4px solid ${borderLeftColor}`, opacity: isConcluida ? 0.7 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', color: isConcluida ? '#aaa' : '#fff', textDecoration: isConcluida ? 'line-through' : 'none' }}>{t.titulo}</h4>
                      <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: t.prioridade === 'Crítica' ? '#b02a37' : t.prioridade === 'Alta' ? '#dc3545' : '#333', color: '#fff', fontWeight: 'bold' }}>{t.prioridade}</span>
                    </div>
                    {t.descricao && (<p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#ccc', lineHeight: '1.4' }}>{t.descricao}</p>)}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#aaa', borderTop: '1px solid #333', paddingTop: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <div>👤 Resp: <strong style={{ color: '#4dabf7' }}>{t.responsavel}</strong> | Criado por: {t.criadoPor}</div>
                      <div><span className={infoPrazo.status === 'vencido' ? 'alerta-vencido' : infoPrazo.status === 'hoje' ? 'alerta-hoje' : ''} style={{ color: infoPrazo.status === 'normal' ? '#aaa' : undefined }}>📅 {infoPrazo.texto}</span></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                      <button onClick={() => alternarStatus(t)} style={{ background: isConcluida ? '#6c757d' : '#28a745', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>{isConcluida ? 'Marcar como Pendente' : '✔ Concluir Tarefa'}</button>
                      <button onClick={() => excluirTarefa(t.id)} style={{ background: '#333', border: '1px solid #555', color: '#ff6b6b', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Excluir</button>
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
    <div style={{ backgroundColor: '#121212', color: '#fff', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
      <form onSubmit={handleLogin} style={{ background: '#1e1e1e', padding: '35px', borderRadius: '8px', width: '360px', boxShadow: '0 4px 15px rgba(0,0,0,0.6)', border: '1px solid #333' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '5px', color: '#4dabf7', fontSize: '18px' }}>NIIP - Pendências</h2>
        <p style={{ textAlign: 'center', color: '#aaa', fontSize: '12px', marginBottom: '25px' }}>Núcleo de Informática e Inspeção de POPs</p>
        {erro && <p style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '15px', background: '#2d1a1a', padding: '8px', borderRadius: '4px' }}>{erro}</p>}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#ccc' }}>E-mail da Equipe</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu.email@exemplo.com" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#2d2d2d', color: '#fff', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#ccc' }}>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#2d2d2d', color: '#fff', boxSizing: 'border-box' }} />
        </div>
        <button type="submit" style={{ width: '100%', padding: '12px', background: '#007bff', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>Entrar no NIIP</button>
      </form>
    </div>
  );
}
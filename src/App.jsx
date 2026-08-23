function TelaLogin({ onLoginSucesso, darkMode, setDarkMode, theme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
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
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box', position: 'relative' }}>
      
      {/* Botão de Alternar Tema no Login */}
      <button 
        onClick={() => setDarkMode(!darkMode)}
        style={{ position: 'absolute', top: '20px', right: '20px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
      >
        {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
      </button>

      <div style={{ background: theme.cardBg, padding: '40px', borderRadius: '10px', width: '100%', maxWidth: '420px', border: `1px solid ${theme.border}`, boxSizing: 'border-box', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        
        {/* Cabeçalho do Login */}
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '22px', color: '#4dabf7' }}>Sistema Integrado</h2>
          <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted }}>NIIP • NOC • NMR</p>
        </div>

        {erro && <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px', borderRadius: '4px', fontSize: '13px', marginBottom: '15px', border: '1px solid #f5c6cb' }}>{erro}</div>}
        {mensagemSucesso && <div style={{ background: '#d4edda', color: '#155724', padding: '10px', borderRadius: '4px', fontSize: '13px', marginBottom: '15px', border: '1px solid #c3e6cb' }}>{mensagemSucesso}</div>}

        {!alterarSenhaMode ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>E-mail da Equipe</label>
              <input 
                type="email" 
                placeholder="seu.email@fibralink.net.br" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ width: '100%', padding: '12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Senha</label>
              <input 
                type="password" 
                placeholder="••••••••••••" 
                value={senha} 
                onChange={(e) => setSenha(e.target.value)} 
                required 
                style={{ width: '100%', padding: '12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', boxSizing: 'border-box' }} 
              />
            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#007bff', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', marginBottom: '15px' }}>
              Entrar no Sistema
            </button>

            <div style={{ textAlign: 'center' }}>
              <button 
                type="button" 
                onClick={() => { setAlterarSenhaMode(true); setErro(''); setMensagemSucesso(''); }}
                style={{ background: 'none', border: 'none', color: '#4dabf7', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
              >
                Alterar minha senha
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAlterarSenha}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Seu E-mail</label>
              <input 
                type="email" 
                placeholder="seu.email@fibralink.net.br" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ width: '100%', padding: '12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Senha Atual</label>
              <input 
                type="password" 
                placeholder="Senha atual" 
                value={senha} 
                onChange={(e) => setSenha(e.target.value)} 
                required 
                style={{ width: '100%', padding: '12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '5px' }}>Nova Senha</label>
              <input 
                type="password" 
                placeholder="Digite a nova senha" 
                value={senhaNova} 
                onChange={(e) => setSenhaNova(e.target.value)} 
                required 
                style={{ width: '100%', padding: '12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '6px', boxSizing: 'border-box' }} 
              />
            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', marginBottom: '15px' }}>
              Atualizar Senha
            </button>

            <div style={{ textAlign: 'center' }}>
              <button 
                type="button" 
                onClick={() => { setAlterarSenhaMode(false); setErro(''); setMensagemSucesso(''); }}
                style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}
              >
                ← Voltar para o Login
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
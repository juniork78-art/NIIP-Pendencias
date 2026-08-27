import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';

const style = document.createElement('style');
style.innerHTML = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    overflow-x: hidden !important;
  }
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
  .alerta-amanha {
    color: #ff9800 !important;
    font-weight: bold;
  }
  @media print {
    body {
      background: #ffffff !important;
      color: #000000 !important;
    }
    .no-print {
      display: none !important;
    }
  }
  @media (max-width: 600px) {
    .container-movel {
      padding: 6px !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    .card-movel {
      padding: 8px !important;
      border-radius: 4px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
  }
`;
document.head.appendChild(style);

const getLetra = (index) => String.fromCharCode(64 + index);

const statusData = (dataStr) => {
  if (!dataStr) return null;
  try {
    const parts = dataStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const dataVencimento = new Date(year, month, day);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const diffTime = dataVencimento - hoje;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return { status: 'vencido', dias: Math.abs(diffDays) };
      if (diffDays === 0) return { status: 'hoje', dias: 0 };
      if (diffDays === 1) return { status: 'amanha', dias: 1 };
    }
    return null;
  } catch (e) {
    return null;
  }
};

const parseDataFabricacaoBateria = (fabStr) => {
  if (!fabStr) return { dataObj: null, textoExato: '' };
  
  const limpo = fabStr.trim();
  
  if (/^\d{1,2}\/\d{2}$/.test(limpo)) {
    const [semanaStr, anoStr] = limpo.split('/');
    const semana = parseInt(semanaStr, 10);
    const ano = 2000 + parseInt(anoStr, 10);
    
    if (semana >= 1 && semana <= 53) {
      const d = new Date(ano, 0, 1 + (semana - 1) * 7);
      const mesesNomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const textoExato = `${semana}ª semana de ${ano} (~${d.getDate()} de ${mesesNomes[d.getMonth()]})`;
      return { dataObj: d, textoExato };
    }
  }
  
  const parts = limpo.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return { dataObj: d, textoExato: limpo };
    }
  }

  return { dataObj: null, textoExato: limpo };
};

const calcularProximaSubstituicaoBateria = (dataFabricacaoStr, popNome = '', tipoBateria = 'Chumbo') => {
  try {
    const { dataObj } = parseDataFabricacaoBateria(dataFabricacaoStr);
    if (dataObj) {
      let anosAdicionais = tipoBateria === 'Lítio' ? 8 : 2;

      const year = dataObj.getFullYear() + anosAdicionais;
      const month = dataObj.getMonth();
      const day = dataObj.getDate();
      const date = new Date(year, month, day);
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    }
    return '';
  } catch (e) { return ''; }
};

const calcularProximaInspecaoBateria = (dataUltimaInspecaoStr) => {
  try {
    const parts = (dataUltimaInspecaoStr || '').split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1 + 3;
      const year = parseInt(parts[2], 10) + Math.floor(month / 12);
      const adjustedMonth = month % 12;
      const date = new Date(year, adjustedMonth, day);
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    }
    return '';
  } catch (e) { return ''; }
};

const calcularProximaLimpezaAr = (dataUltimaLimpezaStr, mesesIntervalo) => {
  try {
    const parts = dataUltimaLimpezaStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1 + mesesIntervalo;
      const year = parseInt(parts[2], 10) + Math.floor(month / 12);
      const adjustedMonth = month % 12;
      const date = new Date(year, adjustedMonth, day);
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    }
    return '';
  } catch (e) { return ''; }
};

const popsIniciaisPadrao = [
  { id: 1, nome: "poseidon", endereco: "Folha 16 Quadra 29 Lote 61, Nova Marabá - mba" },
  { id: 2, nome: "hermes", endereco: "br-222, 57 - São Félix (Casa San João) - mba" },
  { id: 3, nome: "eros", endereco: "av. Itacaiúnas, 1878 - Cidade Nova (CDMA)- mba" },
  { id: 4, nome: "hades", endereco: "fl 27 q. Especial, s/n - Nova Marabá - (disbrava) - mba" },
  { id: 5, nome: "noto", endereco: "br-230, km 9 - (Total Ville) - mba" },
  { id: 6, nome: "afrodite", endereco: "av. Tocantins, 150, Morada Nova (Nutrisolo) - mba" },
  { id: 7, nome: "hemera", endereco: "av. Boa Esperança, qd 27, lt 03 e 05 - Liberdade (Guinhazi) - mba" },
  { id: 8, nome: "apolo", endereco: "fl 31, qd 33, lt 02 (Predio CETIC) - mba" },
  { id: 9, nome: "cratos", endereco: "Distribuidora nossa água, km 8 (Nossa água) - mba" },
  { id: 10, nome: "helius", endereco: "Rua das castanheiras, 123 - Belo Horizonte (Solar das Castanheiras) - mba" },
  { id: 11, nome: "limos", endereco: "Travessa João Passondas de Carvalho - Velha Marabá - POP fica no segundo andar kitnet proxima a varanda que tem vista para rua - mba" },
  { id: 12, nome: "geb", endereco: "Cidade Jardim - pbs" },
  { id: 13, nome: "anubis", endereco: "Lote 37 QD 101, Rodovia, PA-275, Parauapebas - PA, 68515-000 - pbs" },
  { id: 14, nome: "osiris", endereco: "Rua praça da bíblia, grupo correio - Morro dos Ventos - pbs" },
  { id: 15, nome: "set", endereco: "Rua m, n 224 - União - Escritório - pbs" },
  { id: 16, nome: "amaterasu", endereco: "av. 31 de março, 220, Centro / Escritório - itg" },
  { id: 17, nome: "balder", endereco: "R. Dr. Pedro Paulo Barcaúí • Vila Paulista, 68552-700 - Em frente a MEDTRAFEGO - rdc" },
  { id: 18, nome: "telesto", endereco: "Tv. Brasispampa, 272 - Centro, 68520-000, São Domingos do Araguaia-PA - sda" },
  { id: 19, nome: "tupi", endereco: "Rua Guajajaras, 55 - Centro - Escritório - xga" },
  { id: 20, nome: "terra", endereco: "Próprio R. JK, 111 - Centro, Canaã dos Carajás - PA, 68537-860 - cna" },
  { id: 21, nome: "marduk", endereco: "Av. Conselheiro Furtado, 2865 - Edifício Sintese 21, Sala 701 - Belém - bel" },
  { id: 22, nome: "ceuci", endereco: "Av. Dez, 898 - Centro, Rio Maria - PA, 68530-000 - rma" },
  { id: 23, nome: "fanes", endereco: "Distrito industrial - mba" },
  { id: 24, nome: "demeter", endereco: "Avenida Castelo Branco - Centro, 68573-003, São Geraldo do Araguaia - sga" },
  { id: 25, nome: "neftis", endereco: "Avenida Inglaterra 333, Novo Horizonte - Parauapebas - PA, 68515-000 - Galeria - pbs" },
  { id: 26, nome: "bastet", endereco: "Apartamento - Rio Verde - pbs" },
  { id: 27, nome: "hathor", endereco: "vs10 - pbs" },
  { id: 28, nome: "sobek", endereco: "Rio Verde - pbs" }
];

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [popSelecionado, setPopSelecionado] = useState(null);
  const [telaGerenciarPopsAberta, setTelaGerenciarPopsAberta] = useState(false);
  const [listaPops, setListaPops] = useState(popsIniciaisPadrao);
  const [ultimosCheckIns, setUltimosCheckIns] = useState([]);
  const [cronogramaLimpezas, setCronogramaLimpezas] = useState([]);
  const [cronogramaBaterias, setCronogramaBaterias] = useState([]);
  const [dadosGeraisPops, setDadosGeraisPops] = useState({});
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [abaDrawer, setAbaDrawer] = useState('checkins');
  const [showAvisoGlobal, setShowAvisoGlobal] = useState(false);
  const [dadosCarregados, setDadosCarregados] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    try {
      const salvo = localStorage.getItem('darkMode_pops');
      if (salvo !== null) return JSON.parse(salvo);
    } catch (e) {}
    return true;
  });

  const alternarTema = () => {
    setDarkMode(prev => {
      const novoTema = !prev;
      try {
        localStorage.setItem('darkMode_pops', JSON.stringify(novoTema));
      } catch (e) {}
      return novoTema;
    });
  };

  const theme = {
    bg: darkMode ? '#121212' : '#eef2f5',
    cardBg: darkMode ? '#1e1e1e' : '#ffffff',
    cardInner: darkMode ? '#252525' : '#f8f9fa',
    textMain: darkMode ? '#fff' : '#212529',
    textMuted: darkMode ? '#bbb' : '#444444',
    border: darkMode ? '#333' : '#d0d7de',
    inputBg: darkMode ? '#2d2d2d' : '#ffffff',
    inputText: darkMode ? '#fff' : '#212529'
  };

  const obterSiglaPop = (nomePop) => {
    if (!nomePop) return '';
    const popObj = listaPops.find(p => p.nome.toLowerCase() === nomePop.toLowerCase() || (nomePop.toLowerCase() === 'odin' && p.nome.toLowerCase() === 'balder') || (nomePop.toLowerCase() === 'odim' && p.nome.toLowerCase() === 'balder'));
    if (popObj && popObj.endereco) {
      const partes = popObj.endereco.split('-');
      const ultimaParte = partes[partes.length - 1].trim();
      if (ultimaParte.length <= 5) {
        return ultimaParte.toUpperCase();
      }
    }
    const popPadrao = popsIniciaisPadrao.find(p => p.nome.toLowerCase() === nomePop.toLowerCase() || (nomePop.toLowerCase() === 'odin' && p.nome.toLowerCase() === 'balder') || (nomePop.toLowerCase() === 'odim' && p.nome.toLowerCase() === 'balder'));
    if (popPadrao && popPadrao.endereco) {
      const partes = popPadrao.endereco.split('-');
      const ultimaParte = partes[partes.length - 1].trim();
      if (ultimaParte.length <= 5) {
        return ultimaParte.toUpperCase();
      }
    }
    return '';
  };

  const popPertenceAoUsuario = (nomePop) => {
    if (!usuarioLogado) return true;
    const isPedro = usuarioLogado.toLowerCase().includes('pedro');
    if (!isPedro) return true;
    const popObj = listaPops.find(p => p.nome.toLowerCase() === nomePop.toLowerCase() || (nomePop.toLowerCase() === 'odin' && p.nome.toLowerCase() === 'balder') || (nomePop.toLowerCase() === 'odim' && p.nome.toLowerCase() === 'balder'));
    if (popObj) return popObj.endereco.toLowerCase().endsWith('- pbs');
    return false;
  };

  const verificarAlertasGlobaisDetalhados = () => {
    let vencidos = [];
    let amanha = [];
    const processarItem = (nomePop, baseMsg, dataStr) => {
      const res = statusData(dataStr);
      if (nomePop && res && popPertenceAoUsuario(nomePop)) {
        const nomeReal = (nomePop.toLowerCase() === 'odin' || nomePop.toLowerCase() === 'odim') ? 'balder' : nomePop;
        const sigla = obterSiglaPop(nomeReal);
        const nomeFormatado = sigla ? `${realizarNomeExibicao(nomeReal)} - ${sigla}` : realizarNomeExibicao(nomeReal);
        const msgFinal = baseMsg.replace(`POP: ${nomePop.toUpperCase()}`, `POP: ${nomeFormatado}`);

        if (res.status === 'vencido') {
          vencidos.push(`${msgFinal} (Expirado há ${res.dias} dias)`);
        } else if (res.status === 'amanha' || res.status === 'hoje') {
          amanha.push(`${msgFinal} (${res.status === 'hoje' ? 'Vence hoje' : 'Vence amanhã'})`);
        }
      }
    };
    if (ultimosCheckIns) {
      ultimosCheckIns.forEach(c => {
        const nomePop = c.popNome || c.pop || c.nomePop || c.nome_pop || c.nome;
        if (nomePop) processarItem(nomePop, `POP: ${nomePop.toUpperCase()} - Data de inspeção expirada`, c.proximaInspecao);
      });
    }
    if (cronogramaLimpezas) {
      cronogramaLimpezas.forEach(l => processarItem(l.popNome, `POP: ${l.popNome.toUpperCase()} - Limpeza de ar (${l.central}) expirada`, l.proximaLimpeza));
    }
    if (cronogramaBaterias) {
      cronogramaBaterias.forEach(b => processarItem(b.popNome, `POP: ${b.popNome.toUpperCase()} - Banco de Bateria (${b.banco}) expirado`, b.proximaSubstituicao));
    }
    return { vencidos, amanha };
  };

  const realizarNomeExibicao = (nome) => {
    if (!nome) return '';
    const n = nome.toLowerCase();
    if (n === 'odin' || n === 'odim') return 'BALDER';
    return n.toUpperCase();
  };

  const gerarRelatorioGeralIncidentesPDF = () => {
    const janelaPdf = window.open('', '_blank');
    if (!janelaPdf) return;

    const dadosPorCidade = {};

    listaPops.forEach(pop => {
      if (!popPertenceAoUsuario(pop.nome)) return;
      const sigla = obterSiglaPop(pop.nome) || 'GERAL';
      if (!dadosPorCidade[sigla]) {
        dadosPorCidade[sigla] = [];
      }

      const dadosPop = dadosGeraisPops[pop.nome] || {};
      const checkInPop = ultimosCheckIns.find(c => {
        let n = (c.popNome || c.pop || '').toLowerCase();
        if (n === 'odin' || n === 'odim') n = 'balder';
        return n === pop.nome.toLowerCase();
      });

      dadosPorCidade[sigla].push({
        nome: pop.nome,
        endereco: pop.endereco,
        checkIn: checkInPop || null,
        dados: dadosPop
      });
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Geral de Incidentes e Operações</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 25px; color: #000; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0056b3; padding-bottom: 12px; margin-bottom: 20px; }
          h1 { color: #0056b3; margin: 0; font-size: 20px; text-transform: uppercase; }
          h2 { color: #333; font-size: 16px; margin-top: 25px; border-bottom: 2px solid #007bff; padding-bottom: 4px; text-transform: uppercase; background: #eef2f5; padding-left: 8px; }
          h3 { color: #0056b3; font-size: 14px; margin: 12px 0 4px 0; text-transform: uppercase; }
          p { margin: 4px 0; font-size: 12px; }
          .negrito { font-weight: bold; }
          .vermelho { color: #d9534f; font-weight: bold; }
          .verde { color: #28a745; font-weight: bold; }
          .bloco-pop { background: #fdfdfd; border: 1px solid #ddd; padding: 10px 14px; margin-bottom: 10px; border-radius: 4px; border-left: 4px solid #007bff; }
          .incidente-item { background: #fff5f5; border-left: 3px solid #d9534f; padding: 6px 10px; margin: 4px 0; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Relatório Geral - Incidentes, Baterias e Limpezas</h1>
          <div>
            <p><strong>Emitido por:</strong> ${usuarioLogado ? usuarioLogado.split('@')[0].toUpperCase() : 'Sistema'}</p>
            <p><strong>Data:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
    `;

    Object.keys(dadosPorCidade).sort().forEach(sigla => {
      html += `<h2>Região / Cidade: ${sigla}</h2>`;

      dadosPorCidade[sigla].forEach(item => {
        const { nome, endereco, checkIn, dados } = item;
        
        let temIncidentesAtivos = false;
        if (dados.statusAtivos) {
          Object.keys(dados.statusAtivos).forEach(atv => {
            if (dados.statusAtivos[atv] === 'Incidente') temIncidentesAtivos = true;
          });
        }

        html += `
          <div class="bloco-pop">
            <h3>POP: ${nome.toUpperCase()}</h3>
            <p><span class="negrito">Endereço:</span> ${endereco}</p>
            <p><span class="negrito">Última Inspeção:</span> ${checkIn ? checkIn.dataHora : (dados.ultimaDataInspecao ? `${dados.ultimaDataInspecao} (Salva)` : 'Nenhuma registrada')}</p>
            <p><span class="negrito">Próxima Inspeção:</span> ${checkIn ? checkIn.proximaInspecao : 'N/A'}</p>
        `;

        if (temIncidentesAtivos || (dados.incidentesGerais && dados.incidentesGerais.trim() !== '')) {
          html += `<p class="vermelho" style="margin-top:6px;">⚠️ Incidentes Registrados:</p>`;
          if (dados.statusAtivos) {
            Object.keys(dados.statusAtivos).forEach(atv => {
              if (dados.statusAtivos[atv] === 'Incidente') {
                const det = dados.detalhesIncidentes?.[atv] || 'Sem detalhes';
                html += `<div class="incidente-item"><strong>Ativo (${atv}):</strong> ${det}</div>`;
              }
            });
          }
          if (dados.incidentesGerais) {
            html += `<div class="incidente-item"><strong>Incidentes Gerais:</strong> ${dados.incidentesGerais}</div>`;
          }
        } else {
          html += `<p style="color: #666; font-style: italic; margin-top: 4px;">Nenhum incidente relatado neste POP.</p>`;
        }

        const qtdB = dados.qtdBancos || 1;
        html += `<p style="margin-top: 6px;"><span class="negrito">Bancos de Baterias (${qtdB}):</span>`;
        for (let b = 1; b <= qtdB; b++) {
          const fab = dados[`bat_${b}_fab`];
          const tipoB = dados[`bat_${b}_tipo`] || 'Chumbo';
          const proxSub = calcularProximaSubstituicaoBateria(fab, nome, tipoB);
          const resSub = statusData(proxSub);
          html += `<br>&nbsp;&nbsp;• Banco ${getLetra(b)} (${tipoB}) - Fab: ${fab || 'N/A'} | Próx. Troca: ${proxSub || 'N/A'} ${resSub?.status === 'vencido' ? '(VENCIDO)' : ''}`;
        }
        html += `</p>`;

        const qtdA = dados.qtdAr || 1;
        const nomeLower = nome.toLowerCase();
        const interAr = (nomeLower === 'helius' || nomeLower === 'limos' || nomeLower === 'fanes') ? 5 : 8;
        html += `<p style="margin-top: 4px;"><span class="negrito">Centrais de Ar (${qtdA}):</span>`;
        for (let a = 1; a <= qtdA; a++) {
          const limp = dados[`ar_${a}_limp`];
          const proxLimp = calcularProximaLimpezaAr(limp, interAr);
          const resLimp = statusData(proxLimp);
          html += `<br>&nbsp;&nbsp;• Central ${getLetra(a)} (${dados[`ar_${a}_mod`] || 'Mod. N/I'}) - Última Limpeza: ${limp || 'N/A'} | Próx. Limpeza: ${proxLimp || 'N/A'} ${resLimp?.status === 'vencido' ? '(VENCIDO)' : ''}`;
        }
        html += `</p>`;

        if (dados.anotacoes) {
          html += `<p style="margin-top: 4px;"><span class="negrito">Anotações:</span> ${dados.anotacoes}</p>`;
        }

        html += `</div>`;
      });
    });

    html += `</body></html>`;
    janelaPdf.document.write(html);
    janelaPdf.document.close();
    janelaPdf.focus();
    setTimeout(() => {
      janelaPdf.print();
    }, 600);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setUsuarioLogado(user.email);
      else {
        setUsuarioLogado(null);
        setDadosCarregados(false);
        setShowAvisoGlobal(false);
        sessionStorage.removeItem('avisoMostrado');
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (usuarioLogado && dadosCarregados && !sessionStorage.getItem('avisoMostrado')) {
      const { vencidos, amanha } = verificarAlertasGlobaisDetalhados();
      if (vencidos.length > 0 || amanha.length > 0) {
        setShowAvisoGlobal(true);
        sessionStorage.setItem('avisoMostrado', 'true');
      }
    }
  }, [usuarioLogado, dadosCarregados, ultimosCheckIns, cronogramaLimpezas, cronogramaBaterias]);

  useEffect(() => {
    const handlePopState = () => {
      if (popSelecionado) setPopSelecionado(null);
      else if (telaGerenciarPopsAberta) setTelaGerenciarPopsAberta(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [popSelecionado, telaGerenciarPopsAberta]);

  useEffect(() => {
    if (popSelecionado || telaGerenciarPopsAberta) window.history.pushState(null, '', window.location.pathname);
  }, [popSelecionado, telaGerenciarPopsAberta]);

  useEffect(() => {
    if (usuarioLogado) {
      const unsubPops = onSnapshot(doc(db, "config", "lista_pops"), (snap) => {
        if (snap.exists() && snap.data().pops) setListaPops(snap.data().pops);
        else setDoc(doc(db, "config", "lista_pops"), { pops: popsIniciaisPadrao });
      });

      const unsubCheckins = onSnapshot(doc(db, "historico_global", "checkins"), async (snap) => {
        if (snap.exists() && snap.data().lista) {
          let listaOriginal = snap.data().lista;
          let precisaAtualizar = false;

          const listaAtualizada = listaOriginal.map(item => {
            let nomePop = item.popNome || item.pop || item.nomePop || item.nome_pop || item.nome || '';
            if (nomePop.toLowerCase() === 'odin' || nomePop.toLowerCase() === 'odim') {
              precisaAtualizar = true;
              return {
                ...item,
                pop: 'balder',
                popName: 'balder',
                popNome: 'balder'
              };
            }
            return item;
          });

          setUltimosCheckIns(listaAtualizada);

          if (precisaAtualizar) {
            await setDoc(doc(db, "historico_global", "checkins"), { lista: listaAtualizada });
          }
        }
      });

      const unsubPopsDados = onSnapshot(collection(db, "pops_dados"), (snapshot) => {
        const listaLimpezasTemp = [];
        const listaBateriasTemp = [];
        const dadosGeraisTemp = {};

        snapshot.forEach((d) => {
          let popNome = d.id;
          if (popNome.toLowerCase() === 'odin' || popNome.toLowerCase() === 'odim') popNome = 'balder';
          const data = d.data();
          dadosGeraisTemp[popNome.toLowerCase()] = data;

          const qtdAr = data.qtdAr || 4;
          const nomeLower = popNome.toLowerCase();
          const intervaloAr = (nomeLower === 'helius' || nomeLower === 'limos' || nomeLower === 'fanes') ? 5 : 8;
          for (let i = 1; i <= qtdAr; i++) {
            const ultimaLimp = data[`ar_${i}_limp`] || '';
            if (ultimaLimp) {
              listaLimpezasTemp.push({ popNome, central: `Central ${getLetra(i)}`, ultimaLimpeza: ultimaLimp, proximaLimpeza: calcularProximaLimpezaAr(ultimaLimp, intervaloAr) });
            }
          }
          const qtdBancos = data.qtdBancos || 4;
          for (let i = 1; i <= qtdBancos; i++) {
            const fab = data[`bat_${i}_fab`] || '';
            const tipoBat = data[`bat_${i}_tipo`] || 'Chumbo';
            if (fab) {
              listaBateriasTemp.push({ popNome, banco: `Banco ${getLetra(i)}`, fabricacao: fab, proximaSubstituicao: calcularProximaSubstituicaoBateria(fab, popNome, tipoBat) });
            }
          }
        });
        setCronogramaLimpezas(listaLimpezasTemp);
        setCronogramaBaterias(listaBateriasTemp);
        setDadosGeraisPops(dadosGeraisTemp);
        setDadosCarregados(true);
      });

      return () => {
        unsubPops();
        unsubCheckins();
        unsubPopsDados();
      };
    }
  }, [usuarioLogado]);

  const apagarCheckinsAntigos = async () => {
    const confirmacao = window.confirm('Deseja apagar os check-ins mais antigos, mantendo apenas o mais recente de cada POP?');
    if (!confirmacao) return;
    const vistos = new Set();
    const novaLista = [];
    for (const item of ultimosCheckIns) {
      let nomeDoPop = (item.popNome || item.pop || item.nomePop || item.nome_pop || item.nome || '').toLowerCase().trim();
      if (nomeDoPop === 'odin' || nomeDoPop === 'odim') nomeDoPop = 'balder';
      if (nomeDoPop && !vistos.has(nomeDoPop)) {
        vistos.add(nomeDoPop);
        novaLista.push({ ...item, pop: nomeDoPop, popName: nomeDoPop, popNome: nomeDoPop });
      }
    }
    setUltimosCheckIns(novaLista);
    await setDoc(doc(db, "historico_global", "checkins"), { lista: novaLista });
  };

  const apagarCheckInIndividual = async (idxOriginal) => {
    const senhaDigitada = window.prompt('Digite a senha para confirmar a exclusão deste check-in:');
    if (senhaDigitada !== "%001mNbBa*+!") {
      if (senhaDigitada !== null) alert('Senha incorreta! Ação cancelada.');
      return;
    }
    const novaLista = ultimosCheckIns.filter((_, idx) => idx !== idxOriginal);
    setUltimosCheckIns(novaLista);
    try {
      await setDoc(doc(db, "historico_global", "checkins"), { lista: novaLista });
      alert('Check-in removido com sucesso!');
    } catch (e) {
      alert('Erro ao apagar check-in: ' + e.message);
    }
  };

  if (loadingAuth) return <div style={{ color: theme.textMain, backgroundColor: theme.bg, textAlign: 'center', marginTop: '20vh', fontFamily: 'sans-serif', minHeight: '100vh', fontSize: '15px' }}>Carregando InfraManager...</div>;
  if (!usuarioLogado) return <TelaLogin onLoginSucesso={(email) => setUsuarioLogado(email)} darkMode={darkMode} setDarkMode={alternarTema} theme={theme} />;
  if (telaGerenciarPopsAberta) return <TelaGerenciarPops listaPops={listaPops} onBack={() => { setTelaGerenciarPopsAberta(false); window.history.back(); }} theme={theme} />;
  if (popSelecionado) {
    return (
      <TelaInspecao 
        pop={popSelecionado} 
        tecnico={usuarioLogado} 
        ultimosCheckIns={ultimosCheckIns}
        listaPops={listaPops}
        onSelectPop={(novoPop) => setPopSelecionado(novoPop)}
        onBack={() => { setPopSelecionado(null); window.history.back(); }} 
        onCheckInRealizado={async (novoRegistro, forcarCheckin) => {
          let nomeNormalizado = (novoRegistro.popName || '').toLowerCase();
          if (nomeNormalizado === 'odin' || nomeNormalizado === 'odim') nomeNormalizado = 'balder';
          
          const registroCorrigido = {
            ...novoRegistro,
            pop: nomeNormalizado,
            popName: nomeNormalizado,
            popNome: nomeNormalizado
          };

          let novaLista = [...ultimosCheckIns];
          if (forcarCheckin) novaLista = [registroCorrigido, ...ultimosCheckIns];
          else {
            const idx = novaLista.findIndex(item => {
              let pName = (item.popNome || item.pop || '').toLowerCase();
              if (pName === 'odin' || pName === 'odim') pName = 'balder';
              return pName === nomeNormalizado && item.dataHora === registroCorrigido.dataHora;
            });
            if (idx === -1) novaLista = [registroCorrigido, ...ultimosCheckIns];
          }
          setUltimosCheckIns(novaLista);
          await setDoc(doc(db, "historico_global", "checkins"), { lista: novaLista });
        }}
        darkMode={darkMode}
        setDarkMode={alternarTema}
        theme={theme}
      />
    );
  }

  const { vencidos, amanha } = verificarAlertasGlobaisDetalhados();
  const totalAlertas = vencidos.length + amanha.length;

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', margin: 0, padding: 0, boxSizing: 'border-box' }}>
      <TelaListaPops 
        tecnico={usuarioLogado} 
        listaPops={listaPops} 
        ultimosCheckIns={ultimosCheckIns}
        cronogramaLimpezas={cronogramaLimpezas}
        cronogramaBaterias={cronogramaBaterias}
        onPopClick={(pop) => setPopSelecionado(pop)} 
        onOpenDrawer={() => setDrawerAberto(true)}
        onOpenGerenciarPops={() => setTelaGerenciarPopsAberta(true)}
        onOpenAvisos={() => setShowAvisoGlobal(true)}
        onGerarRelatorioGeral={gerarRelatorioGeralIncidentesPDF}
        totalAlertas={totalAlertas}
        onLogout={() => { sessionStorage.removeItem('avisoMostrado'); signOut(auth); setUsuarioLogado(null); }} 
        darkMode={darkMode}
        setDarkMode={alternarTema}
        theme={theme}
      />

      {showAvisoGlobal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, color: theme.textMain, padding: '20px', borderRadius: '12px', border: '2px solid #ff4d4d', width: '100%', maxWidth: '450px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ color: '#ff4d4d', marginTop: 0, fontSize: '17px', textAlign: 'center' }}>⚠️ Atenção: Prazos e Vencimentos</h2>
            <div style={{ margin: '10px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {vencidos.length === 0 && amanha.length === 0 ? (
                <p style={{ color: theme.textMuted, textAlign: 'center', fontSize: '14px' }}>Nenhum alerta pendente no momento.</p>
              ) : (
                <>
                  {vencidos.map((msg, i) => (
                    <div key={i} style={{ background: theme.cardInner, padding: '10px', borderRadius: '6px', borderLeft: '3px solid #ff4d4d' }}>
                      <p className="alerta-vencido" style={{ margin: 0, fontSize: '13px' }}>{msg}</p>
                    </div>
                  ))}
                  {amanha.map((msg, i) => (
                    <div key={i} style={{ background: theme.cardInner, padding: '10px', borderRadius: '6px', borderLeft: '3px solid #ff9800' }}>
                      <p className="alerta-amanha" style={{ margin: 0, fontSize: '13px' }}>{msg}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
            <button onClick={() => setShowAvisoGlobal(false)} style={{ width: '100%', padding: '12px', background: '#ff4d4d', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', marginTop: '10px', fontSize: '14px' }}>Entendido</button>
          </div>
        </div>
      )}

      {drawerAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex' }}>
          <div style={{ width: '320px', background: theme.cardBg, color: theme.textMain, height: '100%', padding: '20px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: '0', fontSize: '16px' }}>Menu do Sistema</h3>
              <button onClick={() => setDrawerAberto(false)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
              <button onClick={() => setAbaDrawer('checkins')} style={{ flex: 1, padding: '8px 6px', background: abaDrawer === 'checkins' ? '#007bff' : theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Check-ins</button>
              <button onClick={() => setAbaDrawer('limpezas')} style={{ flex: 1, padding: '8px 6px', background: abaDrawer === 'limpezas' ? '#007bff' : theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Limpezas Ar</button>
              <button onClick={() => setAbaDrawer('baterias')} style={{ flex: 1, padding: '8px 6px', background: abaDrawer === 'baterias' ? '#007bff' : theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Baterias</button>
            </div>

            {abaDrawer === 'checkins' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1.5px solid ${theme.border}`, paddingBottom: '6px', marginBottom: '10px' }}>
                  <h4 style={{ color: theme.textMuted, fontSize: '15px', margin: 0 }}>Últimos Check-ins</h4>
                  {ultimosCheckIns.length > 0 && (
                    <button onClick={apagarCheckinsAntigos} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Apagar Antigos</button>
                  )}
                </div>
                {ultimosCheckIns.length === 0 ? (
                  <p style={{ color: theme.textMuted, fontSize: '14px' }}>Nenhum check-in registrado.</p>
                ) : (
                  ultimosCheckIns.map((item, idx) => {
                    let nomeDoPop = (item.popNome || item.pop || item.nomePop || item.nome_pop || item.nome || '');
                    if (nomeDoPop.toLowerCase() === 'odin' || nomeDoPop.toLowerCase() === 'odim') nomeDoPop = 'balder';
                    if (!popPertenceAoUsuario(nomeDoPop)) return null;
                    const sigla = obterSiglaPop(nomeDoPop);
                    const nomeExibicao = sigla ? `${realizarNomeExibicao(nomeDoPop)} - ${sigla}` : realizarNomeExibicao(nomeDoPop);
                    const res = statusData(item.proximaInspecao);
                    const vencido = res && res.status === 'vencido';
                    const alertaAmanha = res && (res.status === 'amanha' || res.status === 'hoje');

                    return (
                      <div key={idx} style={{ background: theme.cardInner, padding: '10px', borderRadius: '6px', marginBottom: '8px', fontSize: '13px', border: `1px solid ${theme.border}`, position: 'relative' }}>
                        <button onClick={() => apagarCheckInIndividual(idx)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#ff4d4d', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                        <p style={{ margin: '0 0 4px 0', color: '#4dabf7', fontWeight: 'bold', textTransform: 'uppercase', paddingRight: '15px', fontSize: '13px' }}>POP: {nomeExibicao}</p>
                        <p style={{ margin: '0 0 4px 0', color: theme.textMain }}>Técnico: {item.tecnico}</p>
                        <p style={{ margin: '0 0 4px 0', color: theme.textMuted }}>Data: {item.dataHora}</p>
                        <p className={vencido ? 'alerta-vencido' : alertaAmanha ? 'alerta-amanha' : ''} style={{ margin: 0, color: vencido ? undefined : alertaAmanha ? undefined : '#28a745' }}>
                          Próx. Insp: {item.proximaInspecao} {vencido ? `(Expirado há ${res.dias}d)` : alertaAmanha ? `(${res.status === 'hoje' ? 'Vence hoje' : 'Vence amanhã'})` : ''}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            ) : abaDrawer === 'limpezas' ? (
              <div>
                <h4 style={{ color: theme.textMuted, fontSize: '15px', borderBottom: `1.5px solid ${theme.border}`, paddingBottom: '6px', marginTop: 0 }}>Cronograma Limpezas de Ar</h4>
                {cronogramaLimpezas.map((item, idx) => {
                  let nomeDoPop = item.popNome;
                  if (nomeDoPop.toLowerCase() === 'odin' || nomeDoPop.toLowerCase() === 'odim') nomeDoPop = 'balder';
                  if (!popPertenceAoUsuario(nomeDoPop)) return null;
                  const sigla = obterSiglaPop(nomeDoPop);
                  const nomeExibicao = sigla ? `${realizarNomeExibicao(nomeDoPop)} - ${sigla}` : realizarNomeExibicao(nomeDoPop);
                  const res = statusData(item.proximaLimpeza);
                  const vencido = res && res.status === 'vencido';
                  const alertaAmanha = res && (res.status === 'amanha' || res.status === 'hoje');

                  return (
                    <div key={idx} style={{ background: theme.cardInner, padding: '10px', borderRadius: '6px', marginBottom: '8px', fontSize: '13px', border: `1px solid ${theme.border}` }}>
                      <p style={{ margin: '0 0 4px 0', color: '#4dabf7', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '13px' }}>{nomeExibicao} ({item.central})</p>
                      <p style={{ margin: '0 0 4px 0', color: theme.textMain }}>Última: {item.ultimaLimpeza}</p>
                      <p className={vencido ? 'alerta-vencido' : alertaAmanha ? 'alerta-amanha' : ''} style={{ margin: 0, color: vencido ? undefined : alertaAmanha ? undefined : '#28a745' }}>
                        Próxima: {item.proximaLimpeza} {vencido ? `(Expirado há ${res.dias}d)` : alertaAmanha ? `(${res.status === 'hoje' ? 'Vence hoje' : 'Vence amanhã'})` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <h4 style={{ color: theme.textMuted, fontSize: '15px', borderBottom: `1.5px solid ${theme.border}`, paddingBottom: '6px', marginTop: 0 }}>Cronograma de Baterias</h4>
                {cronogramaBaterias.map((item, idx) => {
                  let nomeDoPop = item.popNome;
                  if (nomeDoPop.toLowerCase() === 'odin' || nomeDoPop.toLowerCase() === 'odim') nomeDoPop = 'balder';
                  if (!popPertenceAoUsuario(nomeDoPop)) return null;
                  const sigla = obterSiglaPop(nomeDoPop);
                  const nomeExibicao = sigla ? `${realizarNomeExibicao(nomeDoPop)} - ${sigla}` : realizarNomeExibicao(nomeDoPop);
                  const res = statusData(item.proximaSubstituicao);
                  const vencido = res && res.status === 'vencido';
                  const alertaAmanha = res && (res.status === 'amanha' || res.status === 'hoje');

                  return (
                    <div key={idx} style={{ background: theme.cardInner, padding: '10px', borderRadius: '6px', marginBottom: '8px', fontSize: '13px', border: `1px solid ${theme.border}` }}>
                      <p style={{ margin: '0 0 4px 0', color: '#4dabf7', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '13px' }}>{nomeExibicao} ({item.banco})</p>
                      <p style={{ margin: '0 0 4px 0', color: theme.textMain }}>Fabricação: {item.fabricacao}</p>
                      <p className={vencido ? 'alerta-vencido' : alertaAmanha ? 'alerta-amanha' : ''} style={{ margin: 0, color: vencido ? undefined : alertaAmanha ? undefined : '#28a745' }}>
                        Troca: {item.proximaSubstituicao} {vencido ? `(Expirado há ${res.dias}d)` : alertaAmanha ? `(${res.status === 'hoje' ? 'Vence hoje' : 'Vence amanhã'})` : ''}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} onClick={() => setDrawerAberto(false)}></div>
      </div>
      )}
    </div>
  );
}

function TelaLogin({ onLoginSucesso, darkMode, setDarkMode, theme }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');

  const [showTrocarSenhaModal, setShowTrocarSenhaModal] = useState(false);
  const [emailTroca, setEmailTroca] = useState('');
  const [senhaAntiga, setSenhaAntiga] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [mostrarSenhaTroca, setMostrarSenhaTroca] = useState(false);
  const [sucessoTroca, setSucessoTroca] = useState('');
  const [erroTroca, setErroTroca] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    try {
      const res = await signInWithEmailAndPassword(auth, email, senha);
      onLoginSucesso(res.user.email);
    } catch (e) { setErro(`Erro: ${e.message}`); }
  };

  const handleTrocarSenha = async (e) => {
    e.preventDefault();
    setErroTroca('');
    setSucessoTroca('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailTroca, senhaAntiga);
      const user = userCredential.user;
      const credential = EmailAuthProvider.credential(user.email, senhaAntiga);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, senhaNova);
      setSucessoTroca('Senha alterada com sucesso! Você já pode entrar com a nova senha.');
      setEmailTroca('');
      setSenhaAntiga('');
      setSenhaNova('');
      await signOut(auth);
    } catch (e) {
      setErroTroca(`Erro ao alterar senha: ${e.message}`);
    }
  };

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100vw', margin: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', position: 'relative', boxSizing: 'border-box' }}>
      <button type="button" onClick={setDarkMode} style={{ position: 'absolute', top: '15px', right: '15px', background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
        {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
      </button>

      <form onSubmit={handleLogin} style={{ background: theme.cardBg, color: theme.textMain, padding: '30px', borderRadius: '8px', width: '340px', border: `1px solid ${theme.border}`, textAlign: 'center', boxSizing: 'border-box' }}>
        <img src="/logo.png" alt="Logo Fibralink" style={{ width: '150px', marginBottom: '15px', objectFit: 'contain' }} />
        <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>InfraManager POP</h2>
        {erro && <p style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '10px' }}>{erro}</p>}
        
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', marginBottom: '15px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px' }} />
        
        <div style={{ position: 'relative', marginBottom: '15px' }}>
          <input type={mostrarSenha ? "text" : "password"} placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%', padding: '10px', paddingRight: '40px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '14px' }} />
          <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '15px' }}>
            {mostrarSenha ? '🔓' : '🔒'}
          </button>
        </div>

        <button type="submit" style={{ width: '100%', padding: '12px', background: '#007bff', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px', fontSize: '14px' }}>Entrar</button>
        
        <button type="button" onClick={() => { setShowTrocarSenhaModal(true); setErroTroca(''); setSucessoTroca(''); }} style={{ background: 'transparent', border: 'none', color: '#4dabf7', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
          Esqueceu/Alterar Senha?
        </button>
      </form>

      {showTrocarSenhaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, color: theme.textMain, padding: '25px', borderRadius: '8px', width: '350px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0, fontSize: '17px', textAlign: 'center' }}>Alterar Senha</h3>
            {erroTroca && <p style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '10px' }}>{erroTroca}</p>}
            {sucessoTroca && <p style={{ color: '#28a745', fontSize: '13px', marginBottom: '10px' }}>{sucessoTroca}</p>}
            
            <form onSubmit={handleTrocarSenha}>
              <input type="email" placeholder="Confirme seu E-mail" value={emailTroca} onChange={(e) => setEmailTroca(e.target.value)} required style={{ width: '100%', padding: '9px', marginBottom: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
              
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={mostrarSenhaTroca ? "text" : "password"} placeholder="Senha Antiga" value={senhaAntiga} onChange={(e) => setSenhaAntiga(e.target.value)} required style={{ width: '100%', padding: '9px', paddingRight: '35px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
              </div>

              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <input type={mostrarSenhaTroca ? "text" : "password"} placeholder="Senha Nova" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} required style={{ width: '100%', padding: '9px', paddingRight: '35px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '15px', fontSize: '13px' }}>
                <input type="checkbox" id="chkMostrarTroca" checked={mostrarSenhaTroca} onChange={() => setMostrarSenhaTroca(!mostrarSenhaTroca)} />
                <label htmlFor="chkMostrarTroca" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {mostrarSenhaTroca ? '🔓' : '🔒'} Mostrar senhas
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowTrocarSenhaModal(false)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
                <button type="submit" style={{ background: '#007bff', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Salvar Nova Senha</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TelaListaPops({ tecnico, listaPops, ultimosCheckIns, cronogramaLimpezas, cronogramaBaterias, onPopClick, onOpenDrawer, onOpenGerenciarPops, onOpenAvisos, onGerarRelatorioGeral, totalAlertas, onLogout, darkMode, setDarkMode, theme }) {
  const [busca, setBusca] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [mostrarSenhaGerenciar, setMostrarSenhaGerenciar] = useState(false);

  // Estados para Tarefas de Longo Prazo
  const [tarefas, setTarefas] = useState([]);
  const [tituloTarefa, setTituloTarefa] = useState('');
  const [descricaoTarefa, setDescricaoTarefa] = useState('');
  const [dataLimiteTarefa, setDataLimiteTarefa] = useState('');
  const [prioridadeTarefa, setPrioridadeTarefa] = useState('Média');

  const nomeTecnicoFormatado = tecnico ? tecnico.split('@')[0].replace('.', ' ').toUpperCase() : '';
  const isPedro = tecnico.toLowerCase().includes('pedro');
  const popsFiltrados = listaPops.filter(p => (isPedro ? p.endereco.toLowerCase().endsWith('- pbs') : true) && (p.nome.toLowerCase().includes(busca.toLowerCase()) || p.endereco.toLowerCase().includes(busca.toLowerCase())));

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "tarefas_longo_prazo"), (snap) => {
      if (snap.exists() && snap.data().lista) {
        setTarefas(snap.data().lista);
      }
    });
    return () => unsub();
  }, []);

  const salvarTarefa = async (e) => {
    e.preventDefault();
    if (!tituloTarefa.trim()) return;

    const novaTarefa = {
      id: Date.now(),
      titulo: tituloTarefa,
      descricao: descricaoTarefa,
      responsavel: nomeTecnicoFormatado,
      dataLimite: dataLimiteTarefa,
      prioridade: prioridadeTarefa,
      criadoEm: new Date().toLocaleDateString()
    };

    const novaLista = [novaTarefa, ...tarefas];
    setTarefas(novaLista);
    await setDoc(doc(db, "config", "tarefas_longo_prazo"), { lista: novaLista });

    setTituloTarefa('');
    setDescricaoTarefa('');
    setDataLimiteTarefa('');
    setPrioridadeTarefa('Média');
    alert('Tarefa salva com sucesso!');
  };

  const deletarTarefa = async (id) => {
    const confirmacao = window.confirm('Deseja excluir esta tarefa?');
    if (!confirmacao) return;
    const novaLista = tarefas.filter(t => t.id !== id);
    setTarefas(novaLista);
    await setDoc(doc(db, "config", "tarefas_longo_prazo"), { lista: novaLista });
  };

  return (
    <div className="container-movel" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', margin: 0, padding: '12px', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '12px', flexWrap: 'wrap', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={onOpenDrawer} style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>☰ Menu</button>
          <img src="/logo.png" alt="Logo Fibralink" style={{ width: '90px', objectFit: 'contain' }} />
          <h1 style={{ margin: 0, fontSize: '16px' }}>| Usuário: {nomeTecnicoFormatado} (NOC N1)</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={onGerarRelatorioGeral} style={{ background: '#17a2b8', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>📊 Relatório Geral</button>
          <button onClick={onOpenAvisos} style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px' }}>
            🔔
            {totalAlertas > 0 && (
              <span style={{ background: '#ff4d4d', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '10px' }}>
                {totalAlertas}
              </span>
            )}
          </button>
          <button onClick={() => setShowPasswordDialog(true)} style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Gerenciar POPs</button>
          <button type="button" onClick={setDarkMode} style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '8px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}</button>
          <button onClick={onLogout} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Sair</button>
        </div>
      </header>

      {/* SEÇÃO DE TAREFA DE LONGO PRAZO */}
      <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '20px', marginBottom: '20px', boxSizing: 'border-box' }}>
        <h3 style={{ marginTop: 0, color: '#4dabf7', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ➕ Nova Tarefa de Longo Prazo
        </h3>
        <form onSubmit={salvarTarefa}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '5px', fontWeight: 'bold' }}>Título da Tarefa *</label>
            <input type="text" placeholder="Ex: Atualização geral dos switches do POP" value={tituloTarefa} onChange={(e) => setTituloTarefa(e.target.value)} required style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '5px', fontWeight: 'bold' }}>Descrição / Detalhes</label>
            <textarea placeholder="Contexto, dependências ou motivo..." rows="3" value={descricaoTarefa} onChange={(e) => setDescricaoTarefa(e.target.value)} style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '5px', fontWeight: 'bold' }}>Responsável (Automático)</label>
            <input type="text" value={nomeTecnicoFormatado} disabled style={{ width: '100%', padding: '10px', background: theme.cardInner, border: `1px solid ${theme.border}`, color: '#4dabf7', fontWeight: 'bold', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} />
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '5px', fontWeight: 'bold' }}>Data Limite (Prazo) *</label>
              <input type="text" placeholder="dd/mm/aaaa" value={dataLimiteTarefa} onChange={(e) => setDataLimiteTarefa(e.target.value)} required style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '5px', fontWeight: 'bold' }}>Prioridade</label>
              <select value={prioridadeTarefa} onChange={(e) => setPrioridadeTarefa(e.target.value)} style={{ width: '100%', padding: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }}>
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Crítica">Crítica</option>
              </select>
            </div>
          </div>

          <button type="submit" style={{ width: '100%', padding: '12px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>
            Salvar Tarefa no Painel
          </button>
        </form>

        {tarefas.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '14px', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, paddingBottom: '5px' }}>Tarefas Cadastradas</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
              {tarefas.map(t => (
                <div key={t.id} style={{ background: theme.cardInner, padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#4dabf7', fontSize: '13px' }}>{t.titulo}</p>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: theme.textMain }}>{t.descricao || 'Sem descrição'}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: theme.textMuted }}>Resp: <strong>{t.responsavel}</strong> | Prazo: <strong>{t.dataLimite}</strong> | Prioridade: <strong>{t.prioridade}</strong></p>
                  </div>
                  <button onClick={() => deletarTarefa(t.id)} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showPasswordDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, color: theme.textMain, padding: '25px', borderRadius: '8px', width: '310px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px' }}>Senha Necessária</h3>
            
            <div style={{ position: 'relative', margin: '15px 0' }}>
              <input type={mostrarSenhaGerenciar ? "text" : "password"} placeholder="Senha do Sistema" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} style={{ width: '100%', padding: '9px', paddingRight: '35px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
              <button type="button" onClick={() => setMostrarSenhaGerenciar(!mostrarSenhaGerenciar)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}>
                {mostrarSenhaGerenciar ? '🔓' : '🔒'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowPasswordDialog(false)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
              <button onClick={() => {
                if (passwordInput === "%001mNbBa*+!") { setShowPasswordDialog(false); setPasswordInput(''); onOpenGerenciarPops(); }
                else { alert('Senha incorreta!'); setPasswordInput(''); }
              }} style={{ background: '#007bff', border: 'none', color: '#fff', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
      <input type="text" placeholder="Pesquisar POP" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: '100%', padding: '11px', borderRadius: '4px', border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.inputText, marginBottom: '15px', boxSizing: 'border-box', fontSize: '14px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
        {popsFiltrados.map((pop) => (
          <div key={pop.id} onClick={() => onPopClick(pop)} style={{ background: theme.cardBg, padding: '14px', borderRadius: '6px', border: `1px solid ${theme.border}`, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 6px 0', color: '#4dabf7', textTransform: 'uppercase', fontSize: '15px' }}>{pop.nome}</h3>
            <p style={{ margin: 0, color: theme.textMuted, fontSize: '14px' }}>{pop.endereco}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TelaGerenciarPops({ listaPops, onBack, theme }) {
  const [showDialog, setShowDialog] = useState(false);
  const [popEdicao, setPopEdicao] = useState(null);
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const salvarPop = async () => {
    if (!nome.trim()) return;
    const novaLista = [...listaPops];
    const index = novaLista.findIndex(p => p.id === popEdicao.id);
    if (index !== -1) novaLista[index] = { ...popEdicao, nome: nome.toLowerCase().trim(), endereco };
    else novaLista.push({ id: Date.now(), nome: nome.toLowerCase().trim(), endereco });
    await setDoc(doc(db, "config", "lista_pops"), { pops: novaLista });
    setShowDialog(false);
  };
  return (
    <div className="container-movel" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', padding: '15px', margin: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>← Voltar</button>
        <h2 style={{ fontSize: '17px', margin: 0 }}>Gerenciar POPs</h2>
        <button onClick={() => { setPopEdicao({ id: Date.now() }); setNome(''); setEndereco(''); setShowDialog(true); }} style={{ background: '#28a745', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+ Novo POP</button>
      </div>
      {showDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: theme.cardBg, color: theme.textMain, padding: '25px', borderRadius: '8px', width: '350px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px' }}>Editar/Novo POP</h3>
            <input type="text" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} style={{ width: '100%', padding: '9px', margin: '10px 0', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
            <input type="text" placeholder="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} style={{ width: '100%', padding: '9px', margin: '10px 0 20px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDialog(false)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
              <button onClick={salvarPop} style={{ background: '#007bff', border: 'none', color: '#fff', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
        {listaPops.map((pop) => (
          <div key={pop.id} style={{ background: theme.cardBg, color: theme.textMain, padding: '14px', borderRadius: '6px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <h4 style={{ margin: '0 0 5px 0', color: '#4dabf7', textTransform: 'uppercase', fontSize: '15px' }}>{pop.nome}</h4>
              <p style={{ margin: 0, color: theme.textMuted, fontSize: '14px' }}>{pop.endereco}</p>
            </div>
            <button onClick={() => { setPopEdicao(pop); setNome(pop.nome); setEndereco(pop.endereco); setShowDialog(true); }} style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Editar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TelaInspecao({ pop, tecnico, ultimosCheckIns, listaPops, onSelectPop, onBack, onCheckInRealizado, darkMode, setDarkMode, theme }) {
  const isDuandys = tecnico.toLowerCase().includes('duandys');
  const cargoLabel = isDuandys ? "Gestor" : "Técnico";
  const nomeTecnicoLogado = tecnico.split('@')[0].replace('.', ' ').toUpperCase();
  
  const [tipoData, setTipoData] = useState('atual');
  const [dataManualInspecao, setDataManualInspecao] = useState('');
  const [ultimaDataSalva, setUltimaDataSalva] = useState('');
  const [incidentesGerais, setIncidentesGerais] = useState('');
  const [precisaLimpeza, setPrecisaLimpeza] = useState(false);
  const [anotacoes, setAnotacoes] = useState('');

  const [menuPopsLateralAberto, setMenuPopsLateralAberto] = useState(false);
  const [buscaPopLateral, setBuscaPopLateral] = useState('');

  const [fotosPop, setFotosPop] = useState([]);
  const [modalFotosAberto, setModalFotosAberto] = useState(false);
  const [fotoCarregadaBase64, setFotoCarregadaBase64] = useState('');
  const [fotoTelaCheiaUrl, setFotoTelaCheiaUrl] = useState(null);

  const [statusAtivos, setStatusAtivos] = useState({
    "Motor de Portão": "OK",
    "Câmeras": "OK",
    "Controle de Acesso": "OK",
    "Sensores": "OK",
    "Central de Alarme": "OK"
  });

  const [ativosPresentes, setAtivosPresentes] = useState({
    "Motor de Portão": true,
    "Câmeras": true,
    "Controle de Acesso": true,
    "Sensores": true,
    "Central de Alarme": true
  });

  const [detalhesIncidentes, setDetalhesIncidentes] = useState({});
  const [qtdBancos, setQtdBancos] = useState(1);
  const [bancosBateria, setBancosBateria] = useState({ 1: { tipo: 'Chumbo', dataFabricacao: '', dataUltimaInspecao: '', voltagens: ['', '', '', ''], salvo: false } });

  const nomePopLower = pop.nome.toLowerCase();
  const intervaloAr = (nomePopLower === 'helius' || nomePopLower === 'limos' || nomePopLower === 'fanes') ? 5 : 8;
  const [qtdAr, setQtdAr] = useState(1);
  const [centraisAr, setCentraisAr] = useState({ 1: { modelo: '', btu: '', dataInstalacao: '', dataUltimaLimpeza: '', salvo: false } });

  const docRef = doc(db, "pops_dados", pop.nome);

  const mapasPops = {
    "poseidon": "https://maps.app.goo.gl/3qcKmyKjA8q7FXCz7",
    "hermes": "https://maps.app.goo.gl/y51qfZ3aXtRmGnKcA",
    "eros": "https://maps.app.goo.gl/DR6VTgdewVinh5Y59",
    "hades": "https://maps.app.goo.gl/Qv9rcGZu6D2J8NoR8",
    "noto": "https://maps.app.goo.gl/Abi5aW5cNdzXL3J37",
    "afrodite": "https://maps.app.goo.gl/JD18uXYmsokA7Rq4A",
    "hemera": "https://maps.app.goo.gl/f8wGghuLgzxoiwTA6",
    "cratos": "https://maps.app.goo.gl/RZbZszmk6z5XNBi96",
    "helius": "https://maps.app.goo.gl/3VW9MpLCKunzaHko8",
    "limos": "https://maps.app.goo.gl/v2b7uLHvRzb5418P8",
    "fanes": "https://maps.app.goo.gl/RQBieTdyzTPBzUzv8",
    "anubis": "https://maps.app.goo.gl/AXLsWWbPrXQ1QVNL8",
    "osiris": "https://maps.app.goo.gl/qPccnboXz54qVeR89",
    "set": "https://maps.app.goo.gl/QEBaUwwzKtqiERjw6",
    "amaterasu": "https://maps.app.goo.gl/4nzRYccPH7rexHu69",
    "balder": "https://maps.app.goo.gl/U7jXJQkAmv7uC4J38",
    "telesto": "https://maps.app.goo.gl/j77DkZtEqtc5Woha9",
    "tupi": "https://maps.app.goo.gl/7vuANWjiAjiiXRvu7",
    "terra": "https://maps.app.goo.gl/3S7P9dL3ACQZbK4b9",
    "marduk": "https://maps.app.goo.gl/xGopvBFEbQT5FYzH9",
    "ceuci": "https://maps.app.goo.gl/C4MvcYVJsectbuY47",
    "demeter": "https://maps.app.goo.gl/5qqVzmDBgq5ybSfF6",
    "neftis": "https://maps.app.goo.gl/VRZezD9Fw99wu6BCA",
    "sobek": ""
  };

  const linkGoogleMaps = mapasPops[pop.nome.toLowerCase()] || null;

  useEffect(() => {
    const carregarDadosPop = async () => {
      let snap = await getDoc(docRef);
      
      if (!snap.exists() && pop.nome.toLowerCase() === 'balder') {
        let snapAntigo = await getDoc(doc(db, "pops_dados", "odin"));
        if (!snapAntigo.exists()) {
          snapAntigo = await getDoc(doc(db, "pops_dados", "odim"));
        }
        if (snapAntigo.exists()) {
          const dadosAntigos = snapAntigo.data();
          await setDoc(docRef, dadosAntigos);
          snap = await getDoc(docRef);
        }
      }

      if (snap.exists()) {
        const data = snap.data();
        if (data.qtdBancos) setQtdBancos(data.qtdBancos);
        if (data.qtdAr) setQtdAr(data.qtdAr);
        if (data.fotosPop) setFotosPop(data.fotosPop);

        if (data.statusAtivos) {
          const filtrados = { ...data.statusAtivos };
          delete filtrados["Bancos de Bateria"];
          delete filtrados["Centrais de Ar"];
          setStatusAtivos(filtrados);
        }
        if (data.ativosPresentes) {
          const filtradosPres = { ...data.ativosPresentes };
          delete filtradosPres["Bancos de Bateria"];
          delete filtradosPres["Centrais de Ar"];
          setAtivosPresentes(filtradosPres);
        }
        if (data.detalhesIncidentes) setDetalhesIncidentes(data.detalhesIncidentes);
        if (data.incidentesGerais) setIncidentesGerais(data.incidentesGerais);
        if (data.precisaLimpeza !== undefined) setPrecisaLimpeza(data.precisaLimpeza);
        if (data.anotacoes) setAnotacoes(data.anotacoes);

        if (data.ultimaDataInspecao) {
          setDataManualInspecao(data.ultimaDataInspecao);
          setUltimaDataSalva(data.ultimaDataInspecao);
          setTipoData('manual');
        }

        const loadedBancos = {};
        for (let i = 1; i <= (data.qtdBancos || 1); i++) {
          loadedBancos[i] = {
            tipo: data[`bat_${i}_tipo`] || 'Chumbo',
            dataFabricacao: data[`bat_${i}_fab`] || '',
            dataUltimaInspecao: data[`bat_${i}_insp`] || '',
            voltagens: [
              data[`bat_${i}_v1`] || '',
              data[`bat_${i}_v2`] || '',
              data[`bat_${i}_v3`] || '',
              data[`bat_${i}_v4`] || ''
            ],
            salvo: data[`bat_${i}_salvo`] || false
          };
        }
        setBancosBateria(loadedBancos);

        const loadedAr = {};
        for (let i = 1; i <= (data.qtdAr || 1); i++) {
          loadedAr[i] = {
            modelo: data[`ar_${i}_mod`] || '',
            btu: data[`ar_${i}_btu`] || '',
            dataInstalacao: data[`ar_${i}_inst`] || '',
            dataUltimaLimpeza: data[`ar_${i}_limp`] || '',
            salvo: data[`ar_${i}_salvo`] || false
          };
        }
        setCentraisAr(loadedAr);
      }
    };

    carregarDadosPop();
  }, [pop.nome]);

  const salvarNoFirebase = async (dadosNovos) => {
    try {
      await setDoc(docRef, dadosNovos, { merge: true });
    } catch (e) {
      console.error("Erro ao salvar:", e);
    }
  };

  const salvarStatusAtivosFirebase = async () => {
    await salvarNoFirebase({
      statusAtivos,
      ativosPresentes,
      detalhesIncidentes,
      incidentesGerais,
      precisaLimpeza,
      anotacoes
    });
    alert("Status dos ativos e observações salvos com sucesso!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoCarregadaBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const salvarFotoPop = async () => {
    if (!fotoCarregadaBase64) {
      alert("Selecione uma foto primeiro.");
      return;
    }
    const novaListaFotos = [...fotosPop, { id: Date.now(), url: fotoCarregadaBase64, data: new Date().toLocaleDateString() }];
    setFotosPop(novaListaFotos);
    setFotoCarregadaBase64('');
    await salvarNoFirebase({ fotosPop: novaListaFotos });
    alert("Foto salva com sucesso!");
  };

  const deletarFotoPop = async (fotoId) => {
    const senha = prompt("Digite a senha do sistema para excluir esta foto:");
    if (senha !== "%001mNbBa*+!") {
      alert("Senha incorreta! Ação cancelada.");
      return;
    }
    const novaListaFotos = fotosPop.filter(f => f.id !== fotoId);
    setFotosPop(novaListaFotos);
    await salvarNoFirebase({ fotosPop: novaListaFotos });
    alert("Foto removida com sucesso!");
  };

  const obterDadosCheckInOriginal = () => {
    if (ultimosCheckIns && ultimosCheckIns.length > 0) {
      const checkInPop = ultimosCheckIns.find(item => {
        let nomeDoPop = (item.popNome || item.pop || item.nomePop || item.nome_pop || item.nome || '').toLowerCase().trim();
        if (nomeDoPop === 'odin' || nomeDoPop === 'odim') nomeDoPop = 'balder';
        return nomeDoPop === pop.nome.toLowerCase().trim();
      });
      if (checkInPop) {
        return {
          tecnico: checkInPop.tecnico || nomeTecnicoLogado,
          dataHora: checkInPop.dataHora || '',
          proximaInspecao: checkInPop.proximaInspecao || ''
        };
      }
    }
    const agora = new Date();
    const dataProx = new Date(agora);
    dataProx.setDate(dataProx.getDate() + 90);
    const dataProxStr = `${String(dataProx.getDate()).padStart(2, '0')}/${String(dataProx.getMonth() + 1).padStart(2, '0')}/${dataProx.getFullYear()}`;
    return {
      tecnico: nomeTecnicoLogado,
      dataHora: ultimaDataSalva ? `${ultimaDataSalva} (Manual)` : `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`,
      proximaInspecao: dataProxStr
    };
  };

  const gerarPdfUltimaInspecao = async () => {
    const dadosOriginais = obterDadosCheckInOriginal();
    const dataInspecaoFinal = dadosOriginais.dataHora;
    const dataProxStr = dadosOriginais.proximaInspecao;
    const tecnicoOriginal = dadosOriginais.tecnico;

    const janelaPdf = window.open('', '_blank');
    if (janelaPdf) {
      let htmlRelatorio = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Relatório de Inspeção - ${pop.nome.toUpperCase()}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #000; line-height: 1.6; }
            .header-rel { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0056b3; padding-bottom: 10px; margin-bottom: 15px; }
            h1 { color: #0056b3; text-transform: uppercase; margin: 0; font-size: 22px; }
            h2 { font-size: 15px; color: #333; margin-top: 25px; border-bottom: 1px solid #ccc; padding-bottom: 3px; text-transform: uppercase; }
            p { margin: 6px 0; }
            .negrito { font-weight: bold; }
            .vermelho { color: #d9534f; font-weight: bold; }
            .bloco { margin-bottom: 12px; background: #f9f9f9; padding: 10px 15px; border-left: 4px solid #0056b3; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="header-rel">
            <h1>Relatório de Inspeção - POP: ${pop.nome.toUpperCase()}</h1>
            <img src="/logo.png" alt="Logo" style="width: 120px; object-fit: contain;" />
          </div>
          <p><span class="negrito">Endereço:</span> ${pop.endereco}</p>
          <p><span class="negrito">${cargoLabel}:</span> ${tecnicoOriginal}</p>
          <p><span class="negrito">Data da Inspeção:</span> ${dataInspecaoFinal}</p>
          <p><span class="negrito">Próxima Inspeção Recomendada:</span> ${dataProxStr}</p>

          <h2>Status dos Ativos no POP</h2>
      `;

      Object.keys(statusAtivos).forEach(ativo => {
        if (ativosPresentes[ativo]) {
          const st = statusAtivos[ativo];
          const det = detalhesIncidentes[ativo];
          htmlRelatorio += `<div class="bloco"><span class="negrito">${ativo}:</span> <span style="color: ${st === 'OK' ? '#28a745' : '#d9534f'}; font-weight: bold;">${st}</span>`;
          if (st === 'Incidente' && det) {
            htmlRelatorio += `<br><span class="vermelho">Incidente Relatado: ${det}</span>`;
          }
          htmlRelatorio += `</div>`;
        }
      });

      htmlRelatorio += `<h2>Bancos de Baterias</h2>`;
      Array.from({ length: qtdBancos }, (_, i) => i + 1).forEach(banco => {
        const bModel = bancosBateria[banco];
        if (bModel) {
          const anosTrocaCalculado = bModel.tipo === 'Lítio' ? 8 : 2;
          const { textoExato } = parseDataFabricacaoBateria(bModel.dataFabricacao);
          const proxSub = calcularProximaSubstituicaoBateria(bModel.dataFabricacao, pop.nome, bModel.tipo);
          const resSub = statusData(proxSub);
          const vencidoSub = resSub && resSub.status === 'vencido';

          const proxInsp = calcularProximaInspecaoBateria(bModel.dataUltimaInspecao);
          const resInsp = statusData(proxInsp);
          const vencidoInsp = resInsp && resInsp.status === 'vencido';

          const voltagensHtml = bModel.tipo !== 'Lítio' 
            ? `<br>Voltagens das Baterias: [ Bat 1: ${bModel.voltagens[0] || '-'}V ] [ Bat 2: ${bModel.voltagens[1] || '-'}V ] [ Bat 3: ${bModel.voltagens[2] || '-'}V ] [ Bat 4: ${bModel.voltagens[3] || '-'}V ]` 
            : '';

          htmlRelatorio += `
            <div class="bloco">
              <span class="negrito">Banco ${getLetra(banco)} (${bModel.tipo})</span><br>
              Data de Fabricação: ${textoExato || 'Não informada'}<br>
              <span class="${vencidoSub ? 'vermelho' : ''}">Próxima Substituição (+${anosTrocaCalculado} anos): ${proxSub || 'N/A'} ${vencidoSub ? `(Expirado há ${resSub.dias} dias)` : ''}</span><br>
              Data da Última Inspeção: ${bModel.dataUltimaInspecao || 'N/A'}<br>
              <span class="${vencidoInsp ? 'vermelho' : ''}">Próxima Inspeção de Bateria (3 meses): ${proxInsp || 'N/A'} ${vencidoInsp ? `(Expirado há ${resInsp.dias} dias)` : ''}</span>
              ${voltagensHtml}
            </div>
          `;
        }
      });

      htmlRelatorio += `<h2>Centrais de Ar Condicionado</h2>`;
      Array.from({ length: qtdAr }, (_, i) => i + 1).forEach(idx => {
        const ar = centraisAr[idx];
        if (ar) {
          const proxLimp = calcularProximaLimpezaAr(ar.dataUltimaLimpeza, intervaloAr);
          const resLimp = statusData(proxLimp);
          const vencidoLimp = resLimp && resLimp.status === 'vencido';

          htmlRelatorio += `
            <div class="bloco">
              <span class="negrito">Central ${getLetra(idx)}</span> (${ar.modelo || 'Modelo não informado'} - ${ar.btu || 'BTU não inf.'})<br>
              Data de Instalação: ${ar.dataInstalacao || 'N/A'}<br>
              Data da Última Limpeza: ${ar.dataUltimaLimpeza || 'N/A'}<br>
              <span class="${vencidoLimp ? 'vermelho' : ''}">Próxima Limpeza (${intervaloAr} meses): ${proxLimp || 'N/A'} ${vencidoLimp ? `(Expirado há ${resLimp.dias} dias)` : ''}</span>
            </div>
          `;
        }
      });

      htmlRelatorio += `
        <h2>Observações e Incidentes Gerais</h2>
        <div class="bloco">
          <p><span class="negrito">Incidentes Gerais:</span> ${incidentesGerais || 'Nenhum incidente relatado.'}</p>
          <p><span class="negrito">Limpeza Necessária:</span> <span class="${precisaLimpeza ? 'vermelho' : ''}">${precisaLimpeza ? 'SIM' : 'NÃO'}</span></p>
          <p><span class="negrito">Anotações Extras:</span> ${anotacoes || 'Nenhuma anotação.'}</p>
        </div>
      </body></html>`;

      janelaPdf.document.write(htmlRelatorio);
      janelaPdf.document.close();
      janelaPdf.focus();
      setTimeout(() => {
        janelaPdf.print();
      }, 600);
    }
  };

  const finalizarInspecao = async () => {
    let dataInspecaoFinal = '';
    let dataProxStr = '';
    let forcarCheckin = false;
    let dataParaSalvar = '';
    const tecnicoOriginal = nomeTecnicoLogado;

    if (tipoData === 'manual' && dataManualInspecao.trim() !== '') {
      const dataFormatada = dataManualInspecao.trim();
      dataInspecaoFinal = `${dataFormatada} (Manual)`;
      dataParaSalvar = dataFormatada;
      
      if (dataFormatada !== ultimaDataSalva) {
        forcarCheckin = true;
      }

      try {
        const parts = dataFormatada.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const dataProx = new Date(year, month, day);
          dataProx.setDate(dataProx.getDate() + 90);
          dataProxStr = `${String(dataProx.getDate()).padStart(2, '0')}/${String(dataProx.getMonth() + 1).padStart(2, '0')}/${dataProx.getFullYear()}`;
        }
      } catch (e) {}
    } else {
      forcarCheckin = true;
      const obterLocalizacao = () => new Promise((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
            () => resolve("Sem GPS"),
            { timeout: 10000 }
          );
        } else {
          resolve("Sem GPS");
        }
      });

      const coords = await obterLocalizacao();
      const agora = new Date();
      const diaStr = String(agora.getDate()).padStart(2, '0');
      const mesStr = String(agora.getMonth() + 1).padStart(2, '0');
      const anoStr = agora.getFullYear();
      const horaStr = String(agora.getHours()).padStart(2, '0');
      const minStr = String(agora.getMinutes()).padStart(2, '0');

      const dataSimples = `${diaStr}/${mesStr}/${anoStr}`;
      dataParaSalvar = dataSimples;
      dataInspecaoFinal = `${dataSimples} ${horaStr}:${minStr} (${coords})`;

      const dataProx = new Date(agora);
      dataProx.setDate(dataProx.getDate() + 90);
      dataProxStr = `${String(dataProx.getDate()).padStart(2, '0')}/${String(dataProx.getMonth() + 1).padStart(2, '0')}/${dataProx.getFullYear()}`;
    }

    if (!dataProxStr) {
      const agora = new Date();
      const dataProx = new Date(agora);
      dataProx.setDate(dataProx.getDate() + 90);
      dataProxStr = `${String(dataProx.getDate()).padStart(2, '0')}/${String(dataProx.getMonth() + 1).padStart(2, '0')}/${dataProx.getFullYear()}`;
    }

    try {
      await salvarNoFirebase({
        statusAtivos,
        ativosPresentes,
        detalhesIncidentes,
        incidentesGerais,
        precisaLimpeza,
        anotacoes,
        ultimaDataInspecao: dataParaSalvar
      });

      setDataManualInspecao(dataParaSalvar);
      setUltimaDataSalva(dataParaSalvar);
      setTipoData('manual');

      const novoRegistro = {
        pop: pop.nome,
        popName: pop.nome,
        popNome: pop.nome,
        dataHora: dataInspecaoFinal,
        tecnico: tecnicoOriginal,
        proximaInspecao: dataProxStr
      };

      await onCheckInRealizado(novoRegistro, forcarCheckin);

      alert("Check-in e dados de inspeção salvos com sucesso!");

      const janelaPdf = window.open('', '_blank');
      if (janelaPdf) {
        let htmlRelatorio = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Relatório de Inspeção - ${pop.nome.toUpperCase()}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 30px; color: #000; line-height: 1.6; }
              .header-rel { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0056b3; padding-bottom: 10px; margin-bottom: 15px; }
              h1 { color: #0056b3; text-transform: uppercase; margin: 0; font-size: 22px; }
              h2 { font-size: 15px; color: #333; margin-top: 25px; border-bottom: 1px solid #ccc; padding-bottom: 3px; text-transform: uppercase; }
              p { margin: 6px 0; }
              .negrito { font-weight: bold; }
              .vermelho { color: #d9534f; font-weight: bold; }
              .bloco { margin-bottom: 12px; background: #f9f9f9; padding: 10px 15px; border-left: 4px solid #0056b3; border-radius: 4px; }
            </style>
          </head>
          <body>
            <div class="header-rel">
              <h1>Relatório de Inspeção - POP: ${pop.nome.toUpperCase()}</h1>
              <img src="/logo.png" alt="Logo" style="width: 120px; object-fit: contain;" />
            </div>
            <p><span class="negrito">Endereço:</span> ${pop.endereco}</p>
            <p><span class="negrito">${cargoLabel}:</span> ${tecnicoOriginal}</p>
            <p><span class="negrito">Data da Inspeção:</span> ${dataInspecaoFinal}</p>
            <p><span class="negrito">Próxima Inspeção Recomendada:</span> ${dataProxStr}</p>

            <h2>Status dos Ativos no POP</h2>
        `;

        Object.keys(statusAtivos).forEach(ativo => {
          if (ativosPresentes[ativo]) {
            const st = statusAtivos[ativo];
            const det = detalhesIncidentes[ativo];
            htmlRelatorio += `<div class="bloco"><span class="negrito">${ativo}:</span> <span style="color: ${st === 'OK' ? '#28a745' : '#d9534f'}; font-weight: bold;">${st}</span>`;
            if (st === 'Incidente' && det) {
              htmlRelatorio += `<br><span class="vermelho">Incidente Relatado: ${det}</span>`;
            }
            htmlRelatorio += `</div>`;
          }
        });

        htmlRelatorio += `<h2>Bancos de Baterias</h2>`;
        Array.from({ length: qtdBancos }, (_, i) => i + 1).forEach(banco => {
          const bModel = bancosBateria[banco];
          if (bModel) {
            const anosTrocaCalculado = bModel.tipo === 'Lítio' ? 8 : 2;
            const { textoExato } = parseDataFabricacaoBateria(bModel.dataFabricacao);
            const proxSub = calcularProximaSubstituicaoBateria(bModel.dataFabricacao, pop.nome, bModel.tipo);
            const resSub = statusData(proxSub);
            const vencidoSub = resSub && resSub.status === 'vencido';

            const proxInsp = calcularProximaInspecaoBateria(bModel.dataUltimaInspecao);
            const resInsp = statusData(proxInsp);
            const vencidoInsp = resInsp && resInsp.status === 'vencido';

            const voltagensHtml = bModel.tipo !== 'Lítio' 
              ? `<br>Voltagens das Baterias: [ Bat 1: ${bModel.voltagens[0] || '-'}V ] [ Bat 2: ${bModel.voltagens[1] || '-'}V ] [ Bat 3: ${bModel.voltagens[2] || '-'}V ] [ Bat 4: ${bModel.voltagens[3] || '-'}V ]` 
              : '';

            htmlRelatorio += `
              <div class="bloco">
                <span class="negrito">Banco ${getLetra(banco)} (${bModel.tipo})</span><br>
                Data de Fabricação: ${textoExato || 'Não informada'}<br>
                <span class="${vencidoSub ? 'vermelho' : ''}">Próxima Substituição (+${anosTrocaCalculado} anos): ${proxSub || 'N/A'} ${vencidoSub ? `(Expirado há ${resSub.dias} dias)` : ''}</span><br>
                Data da Última Inspeção: ${bModel.dataUltimaInspecao || 'N/A'}<br>
                <span class="${vencidoInsp ? 'vermelho' : ''}">Próxima Inspeção de Bateria (3 meses): ${proxInsp || 'N/A'} ${vencidoInsp ? `(Expirado há ${resInsp.dias} dias)` : ''}</span>
                ${voltagensHtml}
              </div>
            `;
          }
        });

        htmlRelatorio += `<h2>Centrais de Ar Condicionado</h2>`;
        Array.from({ length: qtdAr }, (_, i) => i + 1).forEach(idx => {
          const ar = centraisAr[idx];
          if (ar) {
            const proxLimp = calcularProximaLimpezaAr(ar.dataUltimaLimpeza, intervaloAr);
            const resLimp = statusData(proxLimp);
            const vencidoLimp = resLimp && resLimp.status === 'vencido';

            htmlRelatorio += `
              <div class="bloco">
                <span class="negrito">Central ${getLetra(idx)}</span> (${ar.modelo || 'Modelo não informado'} - ${ar.btu || 'BTU não inf.'})<br>
                Data de Instalação: ${ar.dataInstalacao || 'N/A'}<br>
                Data da Última Limpeza: ${ar.dataUltimaLimpeza || 'N/A'}<br>
                <span class="${vencidoLimp ? 'vermelho' : ''}">Próxima Limpeza (${intervaloAr} meses): ${proxLimp || 'N/A'} ${vencidoLimp ? `(Expirado há ${resLimp.dias} dias)` : ''}</span>
              </div>
            `;
          }
        });

        htmlRelatorio += `
          <h2>Observações e Incidentes Gerais</h2>
          <div class="bloco">
            <p><span class="negrito">Incidentes Gerais:</span> ${incidentesGerais || 'Nenhum incidente relatado.'}</p>
            <p><span class="negrito">Limpeza Necessária:</span> <span class="${precisaLimpeza ? 'vermelho' : ''}">${precisaLimpeza ? 'SIM' : 'NÃO'}</span></p>
            <p><span class="negrito">Anotações Extras:</span> ${anotacoes || 'Nenhuma anotação.'}</p>
          </div>
        </body></html>`;

        janelaPdf.document.write(htmlRelatorio);
        janelaPdf.document.close();
        janelaPdf.focus();
        setTimeout(() => {
          janelaPdf.print();
        }, 600);
      }

      onBack();

    } catch (error) {
      alert("Erro ao registrar o check-in: " + error.message);
    }
  };

  const isPedro = tecnico.toLowerCase().includes('pedro');
  const popsFiltradosMenu = listaPops.filter(p => (isPedro ? p.endereco.toLowerCase().endsWith('- pbs') : true) && (p.nome.toLowerCase().includes(buscaPopLateral.toLowerCase()) || p.endereco.toLowerCase().includes(buscaPopLateral.toLowerCase())));

  return (
    <div className="container-movel" style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%', margin: 0, padding: '15px 10px', fontFamily: 'sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      <div style={{ width: '100%', maxWidth: '900px', boxSizing: 'border-box' }}>
        
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px', padding: '4px 0', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onBack} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMain, padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>← Voltar</button>
            <button type="button" onClick={() => setMenuPopsLateralAberto(true)} style={{ background: '#007bff', border: 'none', color: '#fff', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>📁 Trocar POP</button>
          </div>
          <button type="button" onClick={setDarkMode} style={{ background: theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, padding: '7px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
            {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>
        </div>

        {menuPopsLateralAberto && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', zIndex: 1250, display: 'flex' }}>
            <div style={{ width: '310px', background: theme.cardBg, color: theme.textMain, height: '100%', padding: '15px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Selecionar POP</h3>
                <button onClick={() => setMenuPopsLateralAberto(false)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, fontSize: '18px', cursor: 'pointer' }}>✕</button>
              </div>
              <input type="text" placeholder="Filtrar POP..." value={buscaPopLateral} onChange={(e) => setBuscaPopLateral(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px', borderRadius: '4px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
                {popsFiltradosMenu.map((p) => (
                  <div key={p.id} onClick={() => { onSelectPop(p); setMenuPopsLateralAberto(false); }} style={{ background: p.nome.toLowerCase() === pop.nome.toLowerCase() ? '#007bff' : theme.cardInner, color: p.nome.toLowerCase() === pop.nome.toLowerCase() ? '#fff' : theme.textMain, padding: '10px', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${theme.border}` }}>
                    <p style={{ margin: '0 0 3px 0', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '13px' }}>{p.nome}</p>
                    <p style={{ margin: 0, fontSize: '11px', opacity: 0.9 }}>{p.endereco}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }} onClick={() => setMenuPopsLateralAberto(false)}></div>
          </div>
        )}
          
        <div className="card-movel" style={{ background: theme.cardBg, color: theme.textMain, padding: '15px', width: '100%', borderRadius: '6px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ textTransform: 'uppercase', color: '#4dabf7', margin: 0, fontSize: '18px' }}>Inspeção: {pop.nome}</h2>
              <div style={{ display: 'flex', gap: '6px' }}>
                {linkGoogleMaps && (
                  <a 
                    href={linkGoogleMaps} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="no-print"
                    style={{ background: '#007bff', color: '#fff', padding: '5px 10px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    📍 Localização
                  </a>
                )}
                <button 
                  type="button"
                  onClick={() => setModalFotosAberto(true)}
                  className="no-print"
                  style={{ background: '#6c757d', color: '#fff', padding: '5px 10px', borderRadius: '4px', border: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  📷 Fotos {fotosPop.length > 0 ? `(${fotosPop.length})` : ''}
                </button>
              </div>
            </div>
            <img src="/logo.png" alt="Logo" style={{ width: '90px', objectFit: 'contain' }} />
        </div>
        <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '15px' }}>{pop.endereco}</p>

        <p style={{ color: theme.textMain, fontSize: '15px', fontWeight: 'bold', marginBottom: '15px' }}>{cargoLabel}: {nomeTecnicoLogado}</p>

        {modalFotosAberto && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', boxSizing: 'border-box' }}>
            <div style={{ background: theme.cardBg, color: theme.textMain, padding: '20px', borderRadius: '6px', width: '100%', maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: '#4dabf7', fontSize: '16px' }}>Fotos do POP: {pop.nome.toUpperCase()}</h3>
                <button onClick={() => setModalFotosAberto(false)} style={{ background: 'transparent', border: 'none', color: theme.textMuted, fontSize: '18px', cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ marginBottom: '15px', background: theme.cardInner, padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border}` }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 'bold' }}>Carregar Nova Foto</label>
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ width: '100%', marginBottom: '10px', fontSize: '12px', color: theme.textMain }} />
                {fotoCarregadaBase64 && (
                  <div style={{ marginBottom: '10px', textAlign: 'center' }}>
                    <img src={fotoCarregadaBase64} alt="Pré-visualização" style={{ maxWidth: '100%', maxHeight: '110px', objectFit: 'contain', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setFotoTelaCheiaUrl(fotoCarregadaBase64)} title="Clique para ampliar" />
                  </div>
                )}
                <button type="button" onClick={salvarFotoPop} style={{ width: '100%', padding: '8px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>Salvar Foto</button>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: theme.textMuted }}>Fotos Salvas</h4>
                {fotosPop.length === 0 ? (
                  <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center' }}>Nenhuma foto salva para este POP.</p>
                ) : (
                  fotosPop.map((foto) => (
                    <div key={foto.id} style={{ background: theme.cardInner, padding: '8px', borderRadius: '4px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                      <img 
                        src={foto.url} 
                        alt="POP" 
                        style={{ width: '70px', height: '45px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} 
                        onClick={() => setFotoTelaCheiaUrl(foto.url)}
                        title="Clique para abrir em tela cheia"
                      />
                      <div style={{ flex: 1, fontSize: '12px', color: theme.textMuted }}>
                        Salva em: {foto.data}
                      </div>
                      <button type="button" onClick={() => deletarFotoPop(foto.id)} style={{ background: '#dc3545', border: 'none', color: '#fff', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Deletar</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {fotoTelaCheiaUrl && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.95)', zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', boxSizing: 'border-box' }}>
            <button 
              onClick={() => setFotoTelaCheiaUrl(null)} 
              style={{ position: 'absolute', top: '15px', right: '15px', background: '#dc3545', border: 'none', color: '#fff', fontSize: '16px', fontWeight: 'bold', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer' }}
            >
              ✕ Fechar
            </button>
            <img src={fotoTelaCheiaUrl} alt="Tela Cheia" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} />
          </div>
        )}
          
        <div className="no-print" style={{ marginBottom: '18px', background: theme.cardInner, padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px', width: '100%', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12px', color: theme.textMuted, fontWeight: 'bold' }}>Tipo de Data da Inspeção</label>
            <button type="button" onClick={gerarPdfUltimaInspecao} style={{ background: '#007bff', border: 'none', color: '#fff', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
              📄 Gerar PDF da Última Inspeção
            </button>
          </div>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="tipoData" checked={tipoData === 'atual'} onChange={() => setTipoData('atual')} /> Data Atual + GPS
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="tipoData" checked={tipoData === 'manual'} onChange={() => setTipoData('manual')} /> Data Manual Salva
            </label>
        </div>

        {tipoData === 'manual' && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '3px' }}>Informe a data que foi feita a inspeção</label>
            <input type="text" value={dataManualInspecao} onChange={(e) => setDataManualInspecao(e.target.value)} placeholder="ex: 20/08/2026" style={{ width: '100%', padding: '8px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
          </div>
        )}
        </div>

        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Status dos Ativos no POP</h3>
        {Object.keys(statusAtivos).map((ativo) => {
          const presente = ativosPresentes[ativo];
          return (
            <div key={ativo} style={{ background: theme.cardInner, padding: '10px 12px', borderRadius: '6px', marginBottom: '10px', boxSizing: 'border-box', border: `1px solid ${theme.border}`, width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={presente} onChange={(e) => setAtivosPresentes({ ...ativosPresentes, [ativo]: e.target.checked })} />
                  {ativo}
                </label>
                {presente && (
                  <div className="no-print" style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      type="button" 
                      onClick={() => setStatusAtivos({ ...statusAtivos, [ativo]: 'OK' })} 
                      style={{ 
                        background: statusAtivos[ativo] === 'OK' ? '#28a745' : theme.cardBg, 
                        border: `1px solid ${theme.border}`, 
                        color: statusAtivos[ativo] === 'OK' ? '#fff' : theme.textMain, 
                        padding: '4px 10px', 
                        borderRadius: '4px', 
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    >
                      OK
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setStatusAtivos({ ...statusAtivos, [ativo]: 'Incidente' })} 
                      style={{ 
                        background: statusAtivos[ativo] === 'Incidente' ? '#dc3545' : theme.cardBg, 
                        border: `1px solid ${theme.border}`, 
                        color: statusAtivos[ativo] === 'Incidente' ? '#fff' : theme.textMain, 
                        padding: '4px 10px', 
                        borderRadius: '4px', 
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    >
                      Incidente
                    </button>
                  </div>
                )}
              </div>
              {presente && statusAtivos[ativo] === 'Incidente' && (
                <input type="text" placeholder={`Relatar incidente em ${ativo}`} value={detalhesIncidentes[ativo] || ''} onChange={(e) => setDetalhesIncidentes({ ...detalhesIncidentes, [ativo]: e.target.value })} style={{ width: '100%', marginTop: '8px', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
              )}
            </div>
          );
        })}

       <button type="button" onClick={salvarStatusAtivosFirebase} className="no-print" style={{ width: '100%', padding: '10px', background: '#17a2b8', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', marginTop: '6px', marginBottom: '18px', fontSize: '14px', boxSizing: 'border-box' }}>
        Salvar Status dos Ativos
       </button>

       <div style={{ marginTop: '15px', width: '100%', boxSizing: 'border-box' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Bancos de Baterias</h3>
        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {[1, 2, 3, 4].map((num) => (
            <button key={num} type="button" onClick={() => { setQtdBancos(num); salvarNoFirebase({ qtdBancos: num }); }} style={{ padding: '6px 12px', background: qtdBancos === num ? '#007bff' : theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{num}</button>
          ))}
       </div>
       {Array.from({ length: qtdBancos }, (_, i) => i + 1).map((banco) => {
        const bModel = bancosBateria[banco] || { tipo: 'Chumbo', dataFabricacao: '', dataUltimaInspecao: '', voltagens: ['', '', '', ''], salvo: false };
        
        const anosTrocaCalculado = bModel.tipo === 'Lítio' ? 8 : 2;
        const { textoExato } = parseDataFabricacaoBateria(bModel.dataFabricacao);
        const proxSub = calcularProximaSubstituicaoBateria(bModel.dataFabricacao, pop.nome, bModel.tipo);
        const resSub = statusData(proxSub);
        const vencidoSub = resSub && resSub.status === 'vencido';

        const proxInsp = calcularProximaInspecaoBateria(bModel.dataUltimaInspecao);
        const resInsp = statusData(proxInsp);
        const vencidoInsp = resInsp && resInsp.status === 'vencido';

        return (
          <div key={banco} style={{ background: theme.cardInner, padding: '10px 12px', borderRadius: '6px', marginBottom: '12px', boxSizing: 'border-box', border: `1px solid ${theme.border}`, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Banco {getLetra(banco)}</h4>
                <select 
                  disabled={bModel.salvo}
                  value={bModel.tipo}
                  onChange={(e) => {
                    const novoTipo = e.target.value;
                    setBancosBateria({ ...bancosBateria, [banco]: { ...bModel, tipo: novoTipo } });
                  }}
                  style={{ padding: '4px 6px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, borderRadius: '4px', fontSize: '12px' }}
                >
                  <option value="Chumbo">Chumbo</option>
                  <option value="Lítio">Lítio</option>
                </select>
              </div>
              <button type="button" onClick={() => {
                const novoSalvo = !bModel.salvo;
                const novoEstado = { ...bancosBateria, [banco]: { ...bModel, salvo: novoSalvo } };
                setBancosBateria(novoEstado);
                salvarNoFirebase({ 
                  qtdBancos,
                  [`bat_${banco}_tipo`]: bModel.tipo,
                  [`bat_${banco}_fab`]: bModel.dataFabricacao, 
                  [`bat_${banco}_insp`]: bModel.dataUltimaInspecao,
                  [`bat_${banco}_v1`]: bModel.voltagens[0],
                  [`bat_${banco}_v2`]: bModel.voltagens[1],
                  [`bat_${banco}_v3`]: bModel.voltagens[2],
                  [`bat_${banco}_v4`]: bModel.voltagens[3],
                  [`bat_${banco}_salvo`]: novoSalvo 
              });
            }} className="no-print" style={{ background: bModel.salvo ? '#6c757d' : '#28a745', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              {bModel.salvo ? 'Editar' : 'Salvar'}
            </button>
          </div>

          <div style={{ marginBottom: '6px', width: '100%', boxSizing: 'border-box' }}>
            <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '3px' }}>Data de Fabricação (Ex: 39/25 ou dd/MM/aaaa)</label>
            <input type="text" disabled={bModel.salvo} placeholder="ex: 39/25 ou 05/08/2024" value={bModel.dataFabricacao} onChange={(e) => {
              const novoVal = e.target.value;
              setBancosBateria({ ...bancosBateria, [banco]: { ...bModel, dataFabricacao: novoVal } });
          }} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
          </div>

          {textoExato && (
            <p style={{ fontSize: '12px', color: '#28a745', margin: '0 0 4px 0', fontWeight: 'bold' }}>
              Convertido: {textoExato}
            </p>
          )}
           
          <p className={vencidoSub ? 'alerta-vencido' : ''} style={{ fontSize: '12px', color: vencidoSub ? undefined : '#4dabf7', margin: '0 0 6px 0', fontWeight: 'bold' }}>
            Próxima Substituição (+{anosTrocaCalculado} anos): {proxSub || 'Preencha a data'} {vencidoSub && `(Exp. há ${resSub.dias}d)`}
          </p>

          <div style={{ marginBottom: '6px', width: '100%', boxSizing: 'border-box' }}>
            <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '3px' }}>Data da Última Inspeção da Bateria (dd/MM/aaaa)</label>
            <input type="text" disabled={bModel.salvo} placeholder="dd/MM/aaaa" value={bModel.dataUltimaInspecao} onChange={(e) => {
              const novoVal = e.target.value;
              setBancosBateria({ ...bancosBateria, [banco]: { ...bModel, dataUltimaInspecao: novoVal } });
            }} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
          </div>

          <p className={vencidoInsp ? 'alerta-vencido' : ''} style={{ fontSize: '12px', color: vencidoInsp ? undefined : '#4dabf7', margin: '0 0 8px 0', fontWeight: 'bold' }}>
            Próxima Inspeção (3 meses): {proxInsp || 'Preencha a última inspeção'} {vencidoInsp && `(Exp. há ${resInsp.dias}d)`}
          </p>

          {bModel.tipo !== 'Lítio' && (
            <>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '5px', fontWeight: 'bold' }}>Voltagem das 4 Baterias do Banco:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', boxSizing: 'border-box', width: '100%' }}>
                {[0, 1, 2, 3].map((vIdx) => (
                  <input 
                    key={vIdx} 
                    type="text" 
                    disabled={bModel.salvo}
                    placeholder={`Bat ${vIdx + 1}`} 
                    value={bModel.voltagens[vIdx] || ''} 
                    onChange={(e) => {
                      const novasVols = [...bModel.voltagens];
                      novasVols[vIdx] = e.target.value;
                      setBancosBateria({ ...bancosBateria, [banco]: { ...bModel, voltagens: novasVols } });
                    }} 
                  style={{ width: '100%', padding: '7px 4px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', textAlign: 'center', fontSize: '12px' }} 
                />
              ))}
              </div>
            </>
          )}
        </div>
        );
       })}
       </div>

       <div style={{ marginTop: '18px', width: '100%', boxSizing: 'border-box' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Centrais de Ar</h3>
        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {[1, 2, 3, 4].map((num) => (
            <button key={num} type="button" onClick={() => { setQtdAr(num); salvarNoFirebase({ qtdAr: num }); }} style={{ padding: '6px 12px', background: qtdAr === num ? '#007bff' : theme.cardInner, border: `1px solid ${theme.border}`, color: theme.textMain, borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{num}</button>
          ))}
       </div>
       {Array.from({ length: qtdAr }, (_, i) => i + 1).map((idx) => {
        const ar = centraisAr[idx] || { modelo: '', btu: '', dataInstalacao: '', dataUltimaLimpeza: '', salvo: false };
        const proxLimp = calcularProximaLimpezaAr(ar.dataUltimaLimpeza, intervaloAr);
        const resLimp = statusData(proxLimp);
        const vencidoLimp = resLimp && resLimp.status === 'vencido';

        return (
          <div key={idx} style={{ background: theme.cardInner, padding: '10px 12px', borderRadius: '6px', marginBottom: '10px', boxSizing: 'border-box', border: `1px solid ${theme.border}`, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Central {getLetra(idx)}</h4>
              <button type="button" onClick={() => {
                const novoSalvo = !ar.salvo;
                setCentraisAr({ ...centraisAr, [idx]: { ...ar, salvo: novoSalvo } });
                salvarNoFirebase({ 
                  qtdAr,
                  [`ar_${idx}_mod`]: ar.modelo, 
                  [`ar_${idx}_btu`]: ar.btu, 
                  [`ar_${idx}_inst`]: ar.dataInstalacao, 
                  [`ar_${idx}_limp`]: ar.dataUltimaLimpeza, 
                  [`ar_${idx}_salvo`]: novoSalvo 
              });
            }} className="no-print" style={{ background: ar.salvo ? '#6c757d' : '#28a745', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              {ar.salvo ? 'Editar' : 'Salvar'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', marginTop: '8px', boxSizing: 'border-box', flexWrap: 'wrap', width: '100%' }}>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '3px' }}>Modelo</label>
              <input type="text" disabled={ar.salvo} placeholder="Modelo" value={ar.modelo} onChange={(e) => setCentraisAr({ ...centraisAr, [idx]: { ...ar, modelo: e.target.value } })} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '3px' }}>BTU</label>
              <input type="text" disabled={ar.salvo} placeholder="BTU" value={ar.btu} onChange={(e) => setCentraisAr({ ...centraisAr, [idx]: { ...ar, btu: e.target.value } })} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
            </div>
        </div>
        <div style={{ marginBottom: '8px', width: '100%', boxSizing: 'border-box' }}>
          <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '3px' }}>Data de Instalação (dd/MM/aaaa)</label>
          <input type="text" disabled={ar.salvo} placeholder="dd/MM/aaaa" value={ar.dataInstalacao} onChange={(e) => setCentraisAr({ ...centraisAr, [idx]: { ...ar, dataInstalacao: e.target.value } })} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
        </div>
        <div style={{ marginBottom: '4px', width: '100%', boxSizing: 'border-box' }}>
          <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '3px' }}>Data da Última Limpeza (dd/MM/aaaa)</label>
          <input type="text" disabled={ar.salvo} placeholder="dd/MM/aaaa" value={ar.dataUltimaLimpeza} onChange={(e) => setCentraisAr({ ...centraisAr, [idx]: { ...ar, dataUltimaLimpeza: e.target.value } })} style={{ width: '100%', padding: '7px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
        </div>
        <p className={vencidoLimp ? 'alerta-vencido' : ''} style={{ fontSize: '12px', color: vencidoLimp ? undefined : '#4dabf7', margin: '6px 0 6px 0', fontWeight: 'bold' }}>
          Próxima Limpeza ({intervaloAr} meses): {proxLimp || 'Preencha a última limpeza'} {vencidoLimp && `(Exp. há ${resLimp.dias}d)`}
        </p>
       </div>
       );
       })}
       </div>

       <div style={{ marginTop: '18px', width: '100%', boxSizing: 'border-box' }}>
        <input type="text" placeholder="Relatar Incidentes Gerais" value={incidentesGerais} onChange={(e) => setIncidentesGerais(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '12px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />
         
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>
          <input type="checkbox" checked={precisaLimpeza} onChange={(e) => setPrecisaLimpeza(e.target.checked)} id="limpCheck" />
          <label htmlFor="limpCheck" style={{ cursor: 'pointer' }}>Limpeza Necessária</label>
        </div>

        <textarea placeholder="Anotações Extras" rows="3" value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '18px', background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.inputText, boxSizing: 'border-box', fontSize: '13px' }} />

        <button type="button" onClick={finalizarInspecao} className="no-print" style={{ width: '100%', padding: '14px', background: '#28a745', border: 'none', color: '#fff', fontWeight: 'bold', fontSize: '16px', borderRadius: '4px', cursor: 'pointer', boxSizing: 'border-box' }}>
          Finalizar, Salvar e Gerar Relatório
        </button>
       </div>
      </div>
    </div>
    </div>
  );
}

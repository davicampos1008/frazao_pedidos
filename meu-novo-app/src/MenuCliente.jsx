import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// --- CONFIGURAÇÃO DE PRAZOS V.I.R.T.U.S ---
const LIMITES_HORARIO = {
  0: "13:00", // Domingo
  1: "18:00", // Segunda
  2: "18:00", // Terça
  3: "14:00", // Quarta
  4: "18:00", // Quinta
  5: "18:00", // Sexta
  6: null,    // Sábado (Não tem envio)
  feriado: "13:00"
};

export default function MenuCliente({ usuario, tema }) {
  // --- ESTADOS DE DESIGN ---
  const isEscuro = tema === 'escuro';
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif" },
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      primaria: '#f97316',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9',
      sucesso: '#22c55e',
      alerta: '#ef4444',
      promocao: '#eab308'
    },
    cards: { 
        raioBorda: '16px', 
        sombra: isEscuro ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.03)',
        alturaImgDestaque: '220px',
        alturaImgPequena: '85px'
    },
    animacoes: { transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }
  };

  // --- ESTADOS DE DADOS ---
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState('');
  const [carrinho, setCarrinho] = useState(() => {
    const salvo = localStorage.getItem('carrinho_virtus');
    return salvo ? JSON.parse(salvo) : [];
  });

  // --- ESTADOS DE BLOQUEIO E HORÁRIO ---
  const [tempoRestante, setTempoRestante] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);
  const [notificou30min, setNotificou30min] = useState(false);

  // --- ESTADOS DE MODAIS E UI ---
  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);

  const hoje = new Date().toLocaleDateString('en-CA');
  const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);
  const nomeLojaLimpo = (usuario?.loja || 'Loja').replace(/^\d+\s*-\s*/, '').trim();

  // --- FUNÇÕES DE UTILIDADE ---
  const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => setNotificacoes(prev => prev.filter(n => n.id !== id)), 5000);
  };

  // --- LÓGICA DE MONITORAMENTO (BANCO + HORÁRIO) ---
  useEffect(() => {
    const verificarStatusEHorario = async () => {
      try {
        const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
        if (!config) return;

        setPrecosLiberados(config.precos_liberados);
        setIsFeriadoMarcado(config.is_feriado);

        if (config.nao_funciona) {
          setBloqueioAtivo(true);
          setTempoRestante("LOJA FECHADA HOJE");
          return;
        }

        const agora = new Date();
        const diaSemana = agora.getDay();
        const limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

        if (!limiteStr) {
          setBloqueioAtivo(true);
          setTempoRestante("NÃO HÁ ENVIOS HOJE");
          return;
        }

        const [h, m] = limiteStr.split(':').map(Number);
        const dataLimite = new Date();
        dataLimite.setHours(h, m, 0);

        const diffMs = dataLimite - agora;
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMs <= 0) {
          setBloqueioAtivo(true);
          setTempoRestante("PRAZO ENCERRADO");
        } else {
          setBloqueioAtivo(false);
          setTempoRestante(`${Math.floor(diffMin / 60)}h ${diffMin % 60}min`);
          
          if (diffMin <= 30 && !notificou30min) {
            mostrarNotificacao(`⚠️ Faltam 30 min! Envie até as ${limiteStr}`, 'alerta');
            setNotificou30min(true);
          }
        }
      } catch (e) { console.error("Erro Horário:", e); }
    };

    verificarStatusEHorario();
    const timer = setInterval(verificarStatusEHorario, 30000);
    return () => clearInterval(timer);
  }, [notificou30min]);

  // --- CARREGAR DADOS ---
  const carregarDados = useCallback(async () => {
    try {
      const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
      if (pData) setProdutos(pData);
      
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
      if (pedData?.length > 0) setListaEnviadaHoje(pedData);
    } catch (e) { console.error(e); }
  }, [hoje, codLoja]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // --- WHATSAPP ---
  const copiarParaWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let texto = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date().toLocaleDateString('pt-BR')}\n`;
    texto += `----------------------------\n`;
    listaEnviadaHoje.forEach(item => {
      texto += `• *${item.quantidade}x* ${item.nome_produto} (${item.unidade_medida})\n`;
    });
    texto += `----------------------------\n_V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
  };

  // --- COMPONENTES AUXILIARES ---
  const AlertaHorario = () => {
    if (!tempoRestante) return null;
    const isUrgente = tempoRestante.includes('0h') || bloqueioAtivo;
    return (
      <div style={{ background: bloqueioAtivo ? '#ef4444' : (isUrgente ? '#f97316' : '#22c55e'), color: '#fff', padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
        {bloqueioAtivo ? `🚫 ${tempoRestante}` : `⏳ TEMPO RESTANTE PARA ENVIO: ${tempoRestante}`}
      </div>
    );
  };

  // --- RENDERIZAÇÃO: TELA DE PEDIDO JÁ ENVIADO ---
  if (listaEnviadaHoje && !modoVisualizacao) {
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', fontFamily: configDesign.geral.fontePadrao }}>
        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : configDesign.cores.textoForte, color: '#fff', padding: '40px 20px', borderRadius: '25px' }}>
          <div style={{fontSize: '50px'}}>{edicaoLiberada ? '🔓' : '✅'}</div>
          <h2 style={{margin: 0}}>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : 'PEDIDO ENVIADO!'}</h2>
        </div>

        <div style={{ textAlign: 'left', marginTop: '20px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
          <h4 style={{marginTop: 0, color: configDesign.cores.textoSuave}}>RESUMO:</h4>
          {listaEnviadaHoje.map((item, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoForte, fontSize: '14px' }}>
              <b>{item.quantidade}x</b> {item.nome_produto} <small style={{color: configDesign.cores.textoSuave}}>({item.unidade_medida})</small>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={copiarParaWhatsapp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '18px', borderRadius: '15px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
             💬 COPIAR PARA WHATSAPP
          </button>
          <button onClick={() => carregarDados()} style={{ background: configDesign.cores.inputFundo, border: 'none', padding: '15px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR STATUS</button>
          <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', color: configDesign.cores.textoSuave, border: 'none', textDecoration: 'underline' }}>VOLTAR AO INÍCIO</button>
        </div>
      </div>
    );
  }

  // --- RENDERIZAÇÃO: LOJA PRINCIPAL ---
  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao }}>
      <AlertaHorario />
      {isFeriadoMarcado && !bloqueioAtivo && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px', fontSize: '12px', textAlign: 'center', fontWeight: 'bold' }}>
          🚩 ATENÇÃO: Horário de Feriado (Limite até as {LIMITES_HORARIO.feriado})
        </div>
      )}

      {/* HEADER SIMPLIFICADO */}
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: configDesign.cores.fundoCards }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: configDesign.cores.textoForte }}>Olá, {usuario?.nome?.split(' ')[0]}</h2>
        <span style={{ color: configDesign.cores.primaria, fontWeight: 'bold', fontSize: '12px' }}>{nomeLojaLimpo}</span>
      </div>

      {/* MENSAGEM SE ESTIVER BLOQUEADO */}
      {bloqueioAtivo ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '60px' }}>😴</div>
          <h2 style={{ color: configDesign.cores.textoForte }}>Sistema Indisponível</h2>
          <p style={{ color: configDesign.cores.textoSuave }}>{tempoRestante}</p>
        </div>
      ) : (
        <div style={{ padding: '20px' }}>
          {/* Aqui vai o seu mapa de produtos e categorias */}
          <p style={{textAlign: 'center', color: configDesign.cores.textoSuave}}>Escolha os itens abaixo para montar sua lista.</p>
          
          {/* Exemplo da lista de produtos (simplificado para não estourar o código) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
             {/* ... Seu map de produtos aqui ... */}
          </div>
        </div>
      )}

      {/* NOTIFICAÇÕES FLUTUANTES */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999 }}>
        {notificacoes.map(n => (
          <div key={n.id} style={{ background: n.tipo === 'alerta' ? '#ef4444' : '#22c55e', color: '#fff', padding: '12px 20px', borderRadius: '10px', marginBottom: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: '13px', fontWeight: 'bold' }}>
            {n.mensagem}
          </div>
        ))}
      </div>
    </div>
  );
}
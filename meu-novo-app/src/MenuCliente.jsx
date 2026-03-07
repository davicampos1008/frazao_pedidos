import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

const LIMITES_HORARIO = {
  0: "13:00", 1: "18:00", 2: "18:00", 3: "14:00", 4: "18:00", 5: "18:00", 6: null, feriado: "13:00"
};

export default function MenuCliente({ usuario, tema }) {
  const isEscuro = tema === 'escuro';
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [configDesign] = useState({
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
    cards: { raioBorda: '16px', sombra: '0 4px 12px rgba(0,0,0,0.08)' }
  });

  // --- ESTADOS RESTAURADOS ---
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [buscaMenu, setBuscaMenu] = useState('');
  const [carrinho, setCarrinho] = useState(() => JSON.parse(localStorage.getItem('carrinho_virtus') || '[]'));
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  
  // --- ESTADOS DE TRAVA ---
  const [tempoRestante, setTempoRestante] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);
  const [notificou30min, setNotificou30min] = useState(false);

  const codLoja = usuario?.codigo_loja || 1;
  const nomeLojaLimpo = (usuario?.loja || 'Loja').replace(/^\d+\s*-\s*/, '').trim();

  // --- SINCRONIZAÇÃO GLOBAL ---
  const sincronizarSistema = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (!config) return;

    const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
    setHoje(dataEfetiva);
    setPrecosLiberados(config.precos_liberados);
    setIsFeriadoMarcado(config.is_feriado);

    // Lógica de Horário
    const agora = new Date();
    const diaSemana = new Date(dataEfetiva + "T12:00:00").getDay();
    const limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

    if (config.nao_funciona || !limiteStr) {
      setBloqueioAtivo(true);
      setTempoRestante("SISTEMA INDISPONÍVEL");
    } else {
      const [h, m] = limiteStr.split(':').map(Number);
      const dataLimite = new Date();
      dataLimite.setHours(h, m, 0);

      const diffMs = dataLimite - agora;
      if (dataEfetiva === new Date().toLocaleDateString('en-CA') && diffMs <= 0) {
        setBloqueioAtivo(true);
        setTempoRestante("PRAZO ENCERRADO");
      } else {
        setBloqueioAtivo(false);
        if (diffMs > 0 && diffMs < 3600000 * 5) { // Mostra contagem se faltar menos de 5h
            const diffMin = Math.floor(diffMs / 60000);
            setTempoRestante(`${Math.floor(diffMin/60)}h ${diffMin%60}min`);
        }
      }
    }

    // Carregar Banners, Produtos e Pedidos
    const { data: bData } = await supabase.from('banners').select('*');
    if (bData) {
      const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
      setBanners({ topo: bMap.topo, logo: bMap.logo, tematico: bMap.tematico });
    }

    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataEfetiva).eq('loja_id', codLoja);
    setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
  }, [codLoja]);

  useEffect(() => {
    sincronizarSistema();
    const t = setInterval(sincronizarSistema, 30000);
    return () => clearInterval(t);
  }, [sincronizarSistema]);

  // --- WHATSAPP ---
  const copiarParaWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let txt = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => txt += `• *${i.quantidade}x* ${i.nome_produto} (${i.unidade_medida})\n`);
    txt += `---\n_V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  // --- RENDERIZAÇÃO ---
  if (!precosLiberados && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', background: configDesign.cores.fundoGeral, height: '100vh' }}>
        <h2 style={{color: configDesign.cores.textoForte}}>Aguardando Cotação...</h2>
        <p style={{color: configDesign.cores.textoSuave}}>A lista de {new Date(hoje).toLocaleDateString('pt-BR')} ainda não foi liberada.</p>
      </div>
    );
  }

  if (listaEnviadaHoje && !modoVisualizacao) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', background: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '40px 20px', borderRadius: '25px' }}>
          <h2>✅ PEDIDO ENVIADO!</h2>
          <p>Referente ao dia {new Date(hoje).toLocaleDateString('pt-BR')}</p>
        </div>
        <div style={{ textAlign: 'left', marginTop: '20px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
           {listaEnviadaHoje.map((item, i) => (
             <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoForte }}>
               <b>{item.quantidade}x</b> {item.nome_produto}
             </div>
           ))}
        </div>
        <button onClick={copiarParaWhatsapp} style={{ width: '100%', marginTop: '20px', padding: '20px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900' }}>
          💬 ENVIAR CÓPIA PARA WHATSAPP
        </button>
        <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '20px', color: configDesign.cores.textoSuave, textDecoration: 'underline' }}>VOLTAR AO INÍCIO</button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif' }}>
      
      {/* HEADER DE TRAVAS */}
      {tempoRestante && !bloqueioAtivo && (
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
          ⏳ TEMPO RESTANTE PARA ENVIO: {tempoRestante}
        </div>
      )}
      {isFeriadoMarcado && !bloqueioAtivo && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
          🚩 ATENÇÃO: Horário de Feriado (Limite até as 13:00)
        </div>
      )}

      {/* CABEÇALHO COM BANNERS */}
      {categoriaAtiva === 'DESTAQUES' && (
        <div>
          <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div style={{ padding: '0 20px', marginTop: '-40px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff' }} />
          </div>
          <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover' }} />
        </div>
      )}

      {/* MENU CATEGORIAS */}
      <div style={{ padding: '20px 0', position: 'sticky', top: 0, zIndex: 100, background: configDesign.cores.fundoGeral }}>
         <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
            {['DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras', '🥕 Legumes'].map(cat => (
              <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px' }}>{cat}</button>
            ))}
         </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        {produtos.filter(p => categoriaAtiva === 'TODOS' || p.promocao).map(p => (
           <div key={p.id} style={{ background: configDesign.cores.fundoCards, borderRadius: '15px', padding: '10px', boxShadow: configDesign.cards.sombra }}>
              <div style={{ height: '100px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <h4 style={{ color: configDesign.cores.textoForte, fontSize: '12px', margin: '10px 0 5px 0' }}>{p.nome}</h4>
              <span style={{ color: configDesign.cores.primaria, fontWeight: '900' }}>{p.preco}</span>
           </div>
        ))}
      </div>
    </div>
  );
}
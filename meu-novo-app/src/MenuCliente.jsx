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
  const isEscuro = tema === 'escuro';
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [carregando, setCarregando] = useState(true);

  // --- CONFIGURAÇÃO DE DESIGN (RESTAURADO) ---
  const configDesign = {
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      primaria: '#f97316',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      sucesso: '#22c55e',
      alerta: '#ef4444'
    }
  };

  // --- ESTADOS ---
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [buscaMenu, setBuscaMenu] = useState('');
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(null);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);

  const codLoja = usuario?.codigo_loja || 1;
  const nomeLojaLimpo = (usuario?.loja || 'Loja').replace(/^\d+\s*-\s*/, '').trim();

  // --- SINCRONIZAÇÃO ---
  const sincronizar = useCallback(async () => {
    try {
      const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (!config) return;

      const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
      setHoje(dataEfetiva);
      setPrecosLiberados(config.precos_liberados);
      setIsFeriadoMarcado(config.is_feriado);

      // Lógica de Bloqueio e Tempo
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
          if (diffMs > 0 && diffMs < 18000000) { // Exibe contagem se faltar menos de 5h
            const dMin = Math.floor(diffMs / 60000);
            setTempoRestante(`${Math.floor(dMin/60)}h ${dMin%60}min`);
          } else { setTempoRestante(null); }
        }
      }

      // Carregar Banners (Posições: topo, logo, tematico)
      const { data: bData } = await supabase.from('banners').select('*');
      if (bData) {
        const bMap = {}; bData.forEach(b => bMap[b.posicao] = b.imagem_url);
        setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
      }

      // Carregar Produtos e Pedido do Dia
      const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
      setProdutos(pData || []);

      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataEfetiva).eq('loja_id', codLoja);
      setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
      
      setCarregando(false);
    } catch (e) { console.error("Erro VIRTUS:", e); setCarregando(false); }
  }, [codLoja]);

  useEffect(() => {
    sincronizar();
    const t = setInterval(sincronizar, 30000);
    return () => clearInterval(t);
  }, [sincronizar]);

  const copiarWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let txt = `*PEDIDO: ${nomeLojaLimpo}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => txt += `• *${i.quantidade}x* ${i.nome_produto} (${i.unidade_medida})\n`);
    txt += `---\n_Enviado via V.I.R.T.U.S System_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  if (carregando) return <div style={{padding:'100px', textAlign:'center', color:configDesign.cores.textoForte}}>🔄 Carregando Loja...</div>;

  // --- TELA DE ESPERA OU BLOQUEIO ---
  if (!listaEnviadaHoje && (!precosLiberados || bloqueioAtivo)) {
      return (
        <div style={{ padding: '80px 20px', textAlign: 'center', background: configDesign.cores.fundoGeral, height: '100vh', fontFamily:'sans-serif' }}>
          <div style={{fontSize:'60px'}}>{bloqueioAtivo ? '🚫' : '⏳'}</div>
          <h2 style={{color:configDesign.cores.textoForte}}>{bloqueioAtivo ? 'PRAZO ENCERRADO' : 'AGUARDANDO PREÇOS'}</h2>
          <p style={{color:configDesign.cores.textoSuave}}>Referente ao dia {new Date(hoje).toLocaleDateString('pt-BR')}</p>
        </div>
      );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: 'sans-serif' }}>
      
      {/* ALERTA DE TEMPO */}
      {tempoRestante && !bloqueioAtivo && (
        <div style={{ background: configDesign.cores.sucesso, color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
          ⏳ TEMPO RESTANTE: {tempoRestante}
        </div>
      )}
      {isFeriadoMarcado && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>
          🚩 ATENÇÃO: Horário de Feriado (Limite até as 13:00)
        </div>
      )}

      {/* TELA DE PEDIDO ENVIADO */}
      {listaEnviadaHoje && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: configDesign.cores.textoForte, color: '#fff', padding: '40px 20px', borderRadius: '25px' }}>
            <h2 style={{margin:0}}>✅ PEDIDO ENVIADO!</h2>
            <p>Data: {new Date(hoje).toLocaleDateString('pt-BR')}</p>
          </div>
          <div style={{ textAlign: 'left', marginTop: '20px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, color:configDesign.cores.textoForte }}>
             {listaEnviadaHoje.map((item, i) => (
               <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${configDesign.cores.borda}` }}><b>{item.quantidade}x</b> {item.nome_produto}</div>
             ))}
          </div>
          <button onClick={copiarWhatsapp} style={{ width: '100%', marginTop: '20px', padding: '20px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900' }}>💬 WHATSAPP</button>
        </div>
      )}

      {/* CATÁLOGO (BANNER + ABAS + PRODUTOS) */}
      {!listaEnviadaHoje && (
        <>
          {categoriaAtiva === 'DESTAQUES' && (
            <div>
              <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ padding: '0 20px', marginTop: '-40px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff' }} />
              </div>
              <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover' }} />
            </div>
          )}

          <div style={{ padding: '20px 0', position: 'sticky', top: 0, zIndex: 100, background: configDesign.cores.fundoGeral }}>
            <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
              {['DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras', '🥕 Legumes'].map(cat => (
                <button key={cat} onClick={() => setCategoriaAtiva(cat)} style={{ background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, fontWeight: '900', borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', whiteSpace: 'nowrap', paddingBottom: '5px' }}>{cat}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {produtos.filter(p => categoriaAtiva === 'TODOS' || p.promocao || p.categoria?.includes(categoriaAtiva.replace(/[^\w\s]/gi, '').trim())).map(p => (
               <div key={p.id} style={{ background: configDesign.cores.fundoCards, borderRadius: '15px', padding: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                  <div style={{ height: '100px', borderRadius: '10px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
                  <h4 style={{ color: configDesign.cores.textoForte, fontSize: '11px', margin: '10px 0 5px 0' }}>{p.nome}</h4>
                  <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize:'14px' }}>{p.preco}</span>
               </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
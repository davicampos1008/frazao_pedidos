import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const LIMITES_HORARIO = {
  0: "13:00", 1: "18:00", 2: "18:00", 3: "14:00", 4: "18:00", 5: "18:00", 6: null, feriado: "13:00"
};

export default function MenuCliente({ usuario, tema }) {
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [produtos, setProdutos] = useState([]);
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [tempoRestante, setTempoRestante] = useState("");

  const codLoja = usuario?.codigo_loja || 1;
  const isEscuro = tema === 'escuro';

  // --- SINCRONIZAÇÃO COMPLETA ---
  const sincronizar = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (!config) return;

    const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
    setHoje(dataEfetiva);
    setPrecosLiberados(config.precos_liberados);

    // Lógica de Trava
    const agora = new Date();
    // Obtém dia da semana da data efetiva
    const diaSemana = new Date(dataEfetiva + "T12:00:00").getDay();
    const limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

    if (config.nao_funciona || !limiteStr) {
      setBloqueioAtivo(true);
      setTempoRestante("LOJA FECHADA");
    } else {
      const [h, m] = limiteStr.split(':').map(Number);
      const dataLimite = new Date();
      dataLimite.setHours(h, m, 0);
      
      // Se for hoje real, verifica a hora. Se for data futura (teste), libera.
      if (dataEfetiva === new Date().toLocaleDateString('en-CA') && agora > dataLimite) {
        setBloqueioAtivo(true);
        setTempoRestante("PRAZO ENCERRADO");
      } else {
        setBloqueioAtivo(false);
      }
    }

    // Carrega Produtos e Pedidos
    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataEfetiva).eq('loja_id', codLoja);
    setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
  }, [codLoja]);

  useEffect(() => {
    sincronizar();
    const timer = setInterval(sincronizar, 15000);
    return () => clearInterval(timer);
  }, [sincronizar]);

  const copiarWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    let txt = `*PEDIDO: ${usuario?.loja}*\n*DATA:* ${new Date(hoje).toLocaleDateString('pt-BR')}\n---\n`;
    listaEnviadaHoje.forEach(i => txt += `• ${i.quantidade}x ${i.nome_produto}\n`);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
  };

  if (!precosLiberados && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', height: '100vh' }}>
        <div style={{fontSize: '60px'}}>⏳</div>
        <h2 style={{color: isEscuro ? '#fff' : '#111'}}>Aguardando Cotação...</h2>
        <p style={{color: '#64748b'}}>A lista para o dia {new Date(hoje).toLocaleDateString('pt-BR')} está sendo preparada.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', fontFamily: 'sans-serif' }}>
      {bloqueioAtivo && (
        <div style={{ background: '#ef4444', color: '#fff', padding: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>
          🚫 {tempoRestante} PARA O DIA {new Date(hoje).toLocaleDateString('pt-BR')}
        </div>
      )}

      {/* Renderização do Pedido Enviado */}
      {listaEnviadaHoje && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: '#22c55e', color: '#fff', padding: '30px', borderRadius: '20px' }}>
            <h2>✅ PEDIDO ENVIADO!</h2>
            <p>Dia: {new Date(hoje).toLocaleDateString('pt-BR')}</p>
          </div>
          <button onClick={copiarWhatsapp} style={{ width: '100%', marginTop: '20px', padding: '18px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: 'bold' }}>💬 COPIAR PARA WHATSAPP</button>
        </div>
      )}

      {!listaEnviadaHoje && (
        <div style={{ padding: '20px' }}>
          <h2 style={{color: isEscuro ? '#fff' : '#111'}}>Fazer Pedido - {new Date(hoje).toLocaleDateString('pt-BR')}</h2>
          {/* Mapeamento de produtos aqui... */}
        </div>
      )}
    </div>
  );
}
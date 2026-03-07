import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const LIMITES_HORARIO = {
  0: "13:00", 1: "18:00", 2: "18:00", 3: "14:00", 4: "18:00", 5: "18:00", 6: null, feriado: "13:00"
};

export default function MenuCliente({ usuario, tema }) {
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [isFeriadoMarcado, setIsFeriadoMarcado] = useState(false);

  const isEscuro = tema === 'escuro';
  const codLoja = usuario?.codigo_loja || 1;

  const sincronizar = useCallback(async () => {
    const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
    if (!config) return;

    const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
    setHoje(dataEfetiva);
    setPrecosLiberados(config.precos_liberados);
    setIsFeriadoMarcado(config.is_feriado);

    // Lógica de Trava de Horário
    const agora = new Date();
    const diaSemana = new Date(dataEfetiva + "T12:00:00").getDay();
    const limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

    if (config.nao_funciona || !limiteStr) {
      setBloqueioAtivo(true);
    } else {
      const [h, m] = limiteStr.split(':').map(Number);
      const dataLimite = new Date();
      dataLimite.setHours(h, m, 0);
      setBloqueioAtivo(dataEfetiva === new Date().toLocaleDateString('en-CA') && agora > dataLimite);
    }

    // Carregar Produtos (Busca global, sem filtro de data para garantir que apareçam)
    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    // Carregar Pedido do Dia
    const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataEfetiva).eq('loja_id', codLoja);
    setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
  }, [codLoja]);

  useEffect(() => {
    sincronizar();
    const timer = setInterval(sincronizar, 20000);
    return () => clearInterval(timer);
  }, [sincronizar]);

  // Se a loja estiver fechada e não tiver pedido enviado, mostra tela de bloqueio
  if (bloqueioAtivo && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', background: isEscuro ? '#0f172a' : '#f8fafc', height: '100vh', color: isEscuro ? '#fff' : '#111' }}>
        <div style={{fontSize:'60px'}}>🚫</div>
        <h2>PRAZO ENCERRADO</h2>
        <p>O horário limite para pedidos em {new Date(hoje).toLocaleDateString('pt-BR')} já passou.</p>
      </div>
    );
  }

  // Se os preços não foram liberados e não tem pedido enviado, tela de espera
  if (!precosLiberados && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '100px 20px', textAlign: 'center', background: isEscuro ? '#0f172a' : '#f8fafc', height: '100vh', color: isEscuro ? '#fff' : '#111' }}>
        <div style={{fontSize:'60px'}}>⏳</div>
        <h2>AGUARDANDO COTAÇÃO</h2>
        <p>Estamos preparando os melhores preços para {new Date(hoje).toLocaleDateString('pt-BR')}.</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', fontFamily: 'sans-serif' }}>
      
      {/* HEADER DE STATUS */}
      {isFeriadoMarcado && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>
          🚩 ATENÇÃO: Horário de Feriado (Limite até as 13:00)
        </div>
      )}

      {/* TELA DE PEDIDO ENVIADO */}
      {listaEnviadaHoje && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ background: '#22c55e', color: '#fff', padding: '40px 20px', borderRadius: '25px' }}>
            <h2 style={{margin:0}}>✅ PEDIDO ENVIADO!</h2>
            <p>Lista referente ao dia {new Date(hoje).toLocaleDateString('pt-BR')}</p>
          </div>
          <div style={{ textAlign: 'left', marginTop: '20px', background: isEscuro ? '#1e293b' : '#fff', padding: '20px', borderRadius: '20px', color: isEscuro ? '#fff' : '#111' }}>
             {listaEnviadaHoje.map((item, i) => (
               <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}><b>{item.quantidade}x</b> {item.nome_produto}</div>
             ))}
          </div>
          <button onClick={() => window.open(`https://api.whatsapp.com/send?text=Pedido enviado!`, '_blank')} style={{ width: '100%', marginTop: '20px', padding: '18px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '15px', fontWeight: 'bold' }}>💬 WHATSAPP</button>
        </div>
      )}

      {/* CATÁLOGO (TELA NORMAL) */}
      {!listaEnviadaHoje && (
        <div style={{ padding: '20px' }}>
          <h2 style={{ color: isEscuro ? '#fff' : '#111', margin: '0 0 10px 0' }}>Olá, {usuario?.nome || 'Davi'}</h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>Escolha os itens para {new Date(hoje).toLocaleDateString('pt-BR')}</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {produtos.map(p => (
              <div key={p.id} style={{ background: isEscuro ? '#1e293b' : '#fff', borderRadius: '15px', padding: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ width: '100%', height: '100px', backgroundImage: `url(${p.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '10px' }} />
                <h4 style={{ color: isEscuro ? '#fff' : '#111', fontSize: '12px', margin: '10px 0 5px 0' }}>{p.nome}</h4>
                <span style={{ color: '#f97316', fontWeight: '900', fontSize: '14px' }}>{p.preco}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
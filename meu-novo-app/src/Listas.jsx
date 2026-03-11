import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Listas() {
  const [lojas, setLojas] = useState([]);
  const [pedidosDia, setPedidosDia] = useState([]);
  const [modalAberto, setModalAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  
  const obterDataLocal = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(obterDataLocal());
  const [usuariosOnline, setUsuariosOnline] = useState({});
  const [copiadoResumo, setCopiadoResumo] = useState(false);
  const [copiadoWpp, setCopiadoWpp] = useState(false);
  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false);

  const hojeBanco = obterDataLocal();

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  const enviarNotificacao = (titulo, corpo) => {
    if (Notification.permission === "granted") {
      new Notification(titulo, { body: corpo, icon: '/logo192.png' });
    }
  };

  async function carregarDados() {
    try {
      setCarregando(true);
      const { data: dLojas } = await supabase.from('lojas').select('*').order('nome_fantasia', { ascending: true });
      const { data: dPedidos } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      
      const lojasDb = dLojas || [];
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }

      setLojas(lojasDb);
      setPedidosDia(dPedidos || []);
    } catch (err) { console.error("Erro:", err); } 
    finally { setCarregando(false); }
  }

  useEffect(() => {
    carregarDados();
    if (Notification.permission !== "granted") Notification.requestPermission();

    const channelPedidos = supabase
      .channel('alteracoes_pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        carregarDados();
      })
      .subscribe();

    const channelPresence = supabase.channel('online-stores');
    channelPresence
      .on('presence', { event: 'sync' }, () => {
        const state = channelPresence.presenceState();
        const onlineMap = {};
        Object.keys(state).forEach(key => { onlineMap[Number(key)] = true; });
        setUsuariosOnline(onlineMap);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelPedidos);
      supabase.removeChannel(channelPresence);
    };
  }, [dataFiltro]);

  // 💡 LÓGICA DE SOMA: Agora filtra as listas bloqueadas
  const obterSomaTotal = () => {
    const mapa = {};
    pedidosDia.forEach(p => {
      const idLoja = extrairNum(p.loja_id);
      // Pula se estiver bloqueado ou liberado para edição
      if (idLoja !== null && idLoja >= 0 && p.liberado_edicao !== true && p.bloqueado !== true) { 
        const nome = String(p.nome_produto || "Sem Nome").toUpperCase();
        if (!mapa[nome]) mapa[nome] = { nome, total: 0, unidade: p.unidade_medida || "UN", lojasQuePediram: new Set(), bonifTotal: 0 };
        mapa[nome].total += Number(p.quantidade || 0);
        mapa[nome].bonifTotal += Number(p.qtd_bonificada || 0); 
        mapa[nome].lojasQuePediram.add(idLoja);
      }
    });
    return Object.values(mapa).map(item => ({ ...item, qtdLojas: item.lojasQuePediram.size })).sort((a, b) => a.nome.localeCompare(b.nome));
  };

  const listaConsolidada = obterSomaTotal();
  // Filtra IDs que enviaram e NÃO estão bloqueados
  const idsQueEnviaramProgresso = pedidosDia.filter(p => p.liberado_edicao !== true && p.bloqueado !== true).map(p => extrairNum(p.loja_id)).filter(id => id !== null && id > 0);
  const totalLojasValidas = lojas.filter(l => extrairNum(l.codigo_loja) > 0).length;
  const lojasQueEnviaramUnicas = new Set(idsQueEnviaramProgresso).size;
  const lojasFaltantes = Math.max(0, totalLojasValidas - lojasQueEnviaramUnicas);

  const copiarResumoGeral = () => {
    if (listaConsolidada.length === 0) return alert("Nenhum pedido válido recebido ainda.");
    const cabecalho = "*FRAZÃO FRUTAS & CIA - RESUMO GERAL* 📋\nData: " + dataFiltro.split('-').reverse().join('/');
    const corpo = listaConsolidada.map(i => {
      let linha = `- ${i.total} ${i.unidade} : ${formatarNomeItem(i.nome)}`;
      if (i.bonifTotal > 0) linha += ` *(+${i.bonifTotal} bonif)*`;
      linha += ` *(em ${i.qtdLojas} loja${i.qtdLojas > 1 ? 's' : ''})*`;
      return linha;
    }).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    setCopiadoResumo(true);
    setTimeout(() => setCopiadoResumo(false), 2000);
  };

  const copiarListaLoja = () => {
    const pLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja));
    const nomeOperador = pLoja.length > 0 ? pLoja[0].nome_usuario : 'Operador';
    const cabecalho = `*LOJA:* ${modalAberto.nome_fantasia}\n*RESPONSÁVEL:* ${nomeOperador}${pLoja[0]?.bloqueado ? ' [LISTA BLOQUEADA]' : ''}`;
    const corpo = pLoja.map(i => {
       let l = `- ${i.quantidade} ${String(i.unidade || i.unidade_medida).toUpperCase()} : ${formatarNomeItem(String(i.nome || i.nome_produto))}`;
       if(i.qtd_bonificada > 0) l += ` (+${i.qtd_bonificada} bonif)`;
       return l;
    }).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    setCopiadoWpp(true);
    setTimeout(() => setCopiadoWpp(false), 2000);
  };

  const liberarLojaParaRefazer = async () => {
    if(window.confirm(`Liberar a loja ${modalAberto.nome_fantasia}?`)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos').update({ solicitou_refazer: false, solicitou_edicao_item: false, liberado_edicao: true }).eq('data_pedido', dataFiltro).eq('loja_id', extrairNum(modalAberto.codigo_loja));
        setModalAberto(null);
        carregarDados();
      } catch (err) { alert(err.message); setCarregando(false); }
    }
  };

  // 💡 NOVA FUNÇÃO: Apagar a lista completamente
  const apagarListaLoja = async () => {
    if(window.confirm(`🚨 PERIGO: Deseja APAGAR permanentemente a lista da loja ${modalAberto.nome_fantasia}?\n\nIsso resetará o status dela para "Aguardando".`)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos').delete().eq('data_pedido', dataFiltro).eq('loja_id', extrairNum(modalAberto.codigo_loja));
        setModalAberto(null);
        carregarDados();
        mostrarNotificacao("Lista apagada com sucesso.");
      } catch (err) { alert(err.message); setCarregando(false); }
    }
  };

  // 💡 NOVA FUNÇÃO: Bloquear/Desbloquear pedido
  const alternarBloqueioLista = async (statusAtual) => {
    const novoStatus = !statusAtual;
    const msg = novoStatus 
      ? "Bloquear esta lista? Ela continuará visível para o cliente, mas será IGNORADA nos totais de compra e resumo geral."
      : "Desbloquear esta lista? Ela voltará a somar nos totais gerais.";

    if(window.confirm(msg)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos').update({ bloqueado: novoStatus }).eq('data_pedido', dataFiltro).eq('loja_id', extrairNum(modalAberto.codigo_loja));
        setModalAberto(null);
        carregarDados();
      } catch (err) { alert(err.message); setCarregando(false); }
    }
  };

  const mostrarNotificacao = (msg) => { alert("V.I.R.T.U.S: " + msg); };

  const aprovarAjusteItem = async (itemPedido) => {
    try {
        const novosDados = JSON.parse(itemPedido.texto_edicao_item); 
        novosDados.status = 'aprovado';
        novosDados.hora_resp = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        novosDados.quem_respondeu = 'Central Administrativa';
        await supabase.from('pedidos').update({ 
            quantidade: novosDados.qtd,
            qtd_bonificada: novosDados.bonif,
            solicitou_edicao_item: false, 
            texto_edicao_item: JSON.stringify(novosDados)
        }).eq('id', itemPedido.id);
        carregarDados();
    } catch (err) { alert("Erro ao ler dados."); }
  };

  const recusarAjusteItem = async (itemPedido) => {
      try {
          const novosDados = JSON.parse(itemPedido.texto_edicao_item);
          novosDados.status = 'recusado';
          novosDados.hora_resp = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
          await supabase.from('pedidos').update({ solicitou_edicao_item: false, texto_edicao_item: JSON.stringify(novosDados) }).eq('id', itemPedido.id);
          carregarDados();
      } catch (err) { carregarDados(); }
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Atualizando Painel V.I.R.T.U.S...</div>;

  const lojaAbertaPedidos = modalAberto ? pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja)) : [];
  const lojaBloqueada = lojaAbertaPedidos.some(p => p.bloqueado === true);
  const lojaAbertasolicitouRefazer = lojaAbertaPedidos.some(p => p.solicitou_refazer === true);
  const lojaAbertaJaLiberada = lojaAbertaPedidos.some(p => p.liberado_edicao === true);

  const pendenciasDeAjuste = pedidosDia.filter(p => p.solicitou_edicao_item === true);
  const historicoDeAjustes = pedidosDia.filter(p => p.texto_edicao_item && p.texto_edicao_item.includes('"status"'));

  return (
    <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px' }}>
      
      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: '20px', color: 'white', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{margin: 0, fontSize: '18px'}}>📋 PAINEL DE CONFERÊNCIA</h2>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px'}}>
            <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} style={{background: '#222', color: '#fff', border: '1px solid #444', padding: '5px', borderRadius: '8px', fontSize: '12px'}} />
            {dataFiltro !== hojeBanco && (
               <button onClick={() => setDataFiltro(hojeBanco)} style={{background: '#f97316', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'}}>HOJE</button>
            )}
          </div>
        </div>
        <div style={{display: 'flex', gap: '10px'}}>
           <button onClick={() => setModalRelatorioAberto(true)} style={{background: '#3b82f6', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px'}}>📊 RELATÓRIO</button>
           <button onClick={() => window.location.reload()} style={{background: '#333', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold'}}>🔄</button>
        </div>
      </div>

      {pendenciasDeAjuste.length > 0 && (
         <div style={{ backgroundColor: '#fffbeb', borderRadius: '20px', padding: '20px', border: '2px solid #f59e0b', marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#b45309' }}>⚠️ Aprovações Pendentes ({pendenciasDeAjuste.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendenciasDeAjuste.map(item => {
                  let dadosAjuste = { qtd: '?', bonif: 0, hora_pedido: '' };
                  try { dadosAjuste = JSON.parse(item.texto_edicao_item); } catch (e) {}
                  const nomeDaLoja = lojas.find(l => extrairNum(l.codigo_loja) === extrairNum(item.loja_id))?.nome_fantasia || `Loja ${item.loja_id}`;
                  return (
                    <div key={item.id} style={{ background: '#fff', padding: '15px', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #fcd34d' }}>
                       <div>
                          <strong style={{ fontSize: '13px', display: 'block' }}>{nomeDaLoja}</strong>
                          <span style={{ fontSize: '14px' }}>Alterar <b>{item.nome_produto}</b> para <b>{dadosAjuste.qtd}</b></span>
                       </div>
                       <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => recusarAjusteItem(item)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>RECUSAR</button>
                          <button onClick={() => aprovarAjusteItem(item)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>APROVAR</button>
                       </div>
                    </div>
                  );
              })}
            </div>
         </div>
      )}

      {/* QUADRO GERAL */}
      <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', borderTop: '8px solid #f97316', marginBottom: '40px' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '22px', textAlign: 'center', color: '#111' }}>RESUMO GERAL DE COMPRA</h2>
        
        <div style={{ marginTop: '10px', marginBottom: '20px', padding: '12px', backgroundColor: lojasFaltantes === 0 ? '#dcfce7' : '#fef2f2', borderRadius: '12px', display: 'flex', justifyContent: 'space-around', fontSize: '13px', fontWeight: 'bold', color: lojasFaltantes === 0 ? '#166534' : '#991b1b' }}>
            <span>✅ {lojasQueEnviaramUnicas} Lojas Ok</span><span>|</span>
            <span>⏳ {lojasFaltantes} Pendentes</span><span>|</span>
            <span>🏪 {totalLojasValidas} Total</span>
        </div>
        
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '16px', maxHeight: '300px', overflowY: 'auto', padding: '15px', border: '1px solid #eee' }}>
          {listaConsolidada.length === 0 ? (
            <div style={{textAlign: 'center', color: '#999', padding: '20px'}}>Nenhum pedido válido recebido.</div>
          ) : (
            listaConsolidada.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px dashed #e2e8f0' }}>
                <strong style={{ fontSize: '14px' }}>{formatarNomeItem(item.nome)}</strong>
                <div style={{ background: '#fef3c7', color: '#92400e', padding: '6px 12px', borderRadius: '10px', fontWeight: '900' }}>
                  {item.total} <small>{item.unidade}</small>
                </div>
              </div>
            ))
          )}
        </div>
        
        <button onClick={copiarResumoGeral} style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: copiadoResumo ? '#22c55e' : '#f97316', color: 'white', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' }}>
          {copiadoResumo ? '✅ COPIADO!' : '📋 COPIAR RESUMO PARA COMPRAS'}
        </button>
      </div>

      <h3 style={{ marginLeft: '10px', color: '#333' }}>Status das Filiais</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '15px' }}>
        {lojas.filter(l => extrairNum(l.codigo_loja) >= 0).map(loja => {
          const idDestaLoja = extrairNum(loja.codigo_loja);
          const pedidosDaLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === idDestaLoja);
          const enviou = pedidosDaLoja.length > 0;
          const estaBloqueada = pedidosDaLoja.some(p => p.bloqueado === true);
          const estaOnline = usuariosOnline[idDestaLoja];
          
          let bordaCor = enviou ? '#22c55e' : '#f1f5f9';
          let textoStatus = enviou ? '● PEDIDO RECEBIDO' : '○ AGUARDANDO';

          if (estaBloqueada) {
            bordaCor = '#64748b'; textoStatus = '🚫 LISTA BLOQUEADA (TESTE)';
          } else if (pedidosDaLoja.some(p => p.solicitou_refazer)) {
            bordaCor = '#eab308'; textoStatus = '⚠️ PEDIU PARA EDITAR';
          } else if (pedidosDaLoja.some(p => p.liberado_edicao)) {
            bordaCor = '#3b82f6'; textoStatus = '🔓 EDITANDO...';
          }
          
          return (
            <div key={idDestaLoja} onClick={() => enviou && setModalAberto(loja)} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '18px', border: `2px solid ${estaOnline ? '#a855f7' : bordaCor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: enviou ? 'pointer' : 'default', opacity: estaBloqueada ? 0.6 : 1 }}>
              <div>
                <strong style={{fontSize: '15px'}}>{loja.nome_fantasia}</strong>
                <span style={{display: 'block', fontSize: '11px', color: '#666', fontWeight: 'bold', marginTop: '4px'}}>{textoStatus}</span>
              </div>
              <div style={{fontSize: '24px'}}>{estaBloqueada ? '🚫' : (enviou ? '✅' : '⏳')}</div>
            </div>
          );
        })}
      </div>

      {/* MODAL DETALHES LOJA */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '420px', maxHeight: '85vh', borderRadius: '25px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
              <h3 style={{ margin: 0 }}>{modalAberto.nome_fantasia}</h3>
              <button onClick={() => setModalAberto(null)} style={{ border: 'none', background: 'none', fontWeight: 'bold', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {lojaAbertaPedidos.map((item, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{formatarNomeItem(item.nome_produto)}</span>
                  <strong>{item.quantidade} {item.unidade_medida}</strong>
                </div>
              ))}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '8px' }}>
               <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={liberarLojaParaRefazer} style={{ flex: 1, padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>🔓 ABRIR CARRINHO</button>
                  <button onClick={copiarListaLoja} style={{ flex: 1, padding: '12px', background: '#25d366', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>🟢 WHATSAPP</button>
               </div>
               
               <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                  <button onClick={() => alternarBloqueioLista(lojaBloqueada)} style={{ flex: 1, padding: '12px', background: lojaBloqueada ? '#111' : '#64748b', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>
                    {lojaBloqueada ? '🔓 DESBLOQUEAR LISTA' : '🚫 BLOQUEAR (TESTE)'}
                  </button>
                  <button onClick={apagarListaLoja} style={{ flex: 1, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>
                    🗑️ APAGAR LISTA
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
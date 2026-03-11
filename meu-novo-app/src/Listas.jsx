import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Listas() {
  const [lojas, setLojas] = useState([]);
  const [pedidosDia, setPedidosDia] = useState([]);
  const [modalAberto, setModalAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  
  // 💡 CORREÇÃO: Força a data local do Brasil, ignorando o fuso UTC de Londres
  const obterDataLocal = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(obterDataLocal());
  const [usuariosOnline, setUsuariosOnline] = useState({});

  const [copiadoResumo, setCopiadoResumo] = useState(false);
  const [copiadoWpp, setCopiadoWpp] = useState(false);

  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false);

  // 💡 MANTÉM A REFERÊNCIA DE HOJE SEMPRE CORRETA
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, () => {
        enviarNotificacao("📋 Novo Pedido!", `Uma loja acabou de enviar uma lista.`);
        carregarDados();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `solicitou_refazer=eq.true` }, () => {
        enviarNotificacao("⚠️ Solicitação de Edição", `Uma loja pediu para destrancar a lista.`);
        carregarDados();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `solicitou_edicao_item=eq.true` }, () => {
        enviarNotificacao("✏️ Edição de Item!", `Um cliente enviou uma correção de quantidade.`);
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

  const obterSomaTotal = () => {
    const mapa = {};
    pedidosDia.forEach(p => {
      const idLoja = extrairNum(p.loja_id);
      if (idLoja !== null && idLoja >= 0 && p.liberado_edicao !== true) { 
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
  const idsQueEnviaramProgresso = pedidosDia.filter(p => p.liberado_edicao !== true).map(p => extrairNum(p.loja_id)).filter(id => id !== null && id > 0);
  const totalLojasValidas = lojas.filter(l => extrairNum(l.codigo_loja) > 0).length;
  const lojasQueEnviaramUnicas = new Set(idsQueEnviaramProgresso).size;
  const lojasFaltantes = totalLojasValidas - lojasQueEnviaramUnicas;

  const copiarResumoGeral = () => {
    if (listaConsolidada.length === 0) return alert("Nenhum pedido recebido ainda.");
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
    const cabecalho = `*LOJA:* ${modalAberto.nome_fantasia}\n*RESPONSÁVEL:* ${nomeOperador}`;
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
    } catch (err) { 
        alert("Erro ao ler dados do pedido."); 
        recusarAjusteItem(itemPedido);
    }
  };

  const recusarAjusteItem = async (itemPedido) => {
      try {
          const novosDados = JSON.parse(itemPedido.texto_edicao_item);
          novosDados.status = 'recusado';
          novosDados.hora_resp = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
          novosDados.quem_respondeu = 'Central Administrativa';

          await supabase.from('pedidos').update({ 
              solicitou_edicao_item: false, 
              texto_edicao_item: JSON.stringify(novosDados) 
          }).eq('id', itemPedido.id);
          
          carregarDados();
      } catch (err) {
          await supabase.from('pedidos').update({ solicitou_edicao_item: false, texto_edicao_item: null }).eq('id', itemPedido.id);
          carregarDados();
      }
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando painel...</div>;

  const lojaAbertaPedidos = modalAberto ? pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja)) : [];
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
           <button onClick={() => setModalRelatorioAberto(true)} style={{background: '#3b82f6', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px'}}>
             📊 RELATÓRIO DE EDIÇÕES
           </button>
           <button onClick={() => window.location.reload()} style={{background: '#333', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold'}}>🔄</button>
        </div>
      </div>

      {pendenciasDeAjuste.length > 0 && (
         <div style={{ backgroundColor: '#fffbeb', borderRadius: '20px', padding: '20px', border: '2px solid #f59e0b', marginBottom: '30px', boxShadow: '0 10px 20px rgba(245, 158, 11, 0.15)' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#b45309', display: 'flex', alignItems: 'center', gap: '10px' }}>
              ⚠️ Aprovações Pendentes ({pendenciasDeAjuste.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendenciasDeAjuste.map(item => {
                 let dadosAjuste = { qtd: '?', bonif: 0, hora_pedido: '' };
                 try { dadosAjuste = JSON.parse(item.texto_edicao_item); } catch (e) {}
                 const nomeDaLoja = lojas.find(l => extrairNum(l.codigo_loja) === extrairNum(item.loja_id))?.nome_fantasia || `Loja ${item.loja_id}`;

                 return (
                    <div key={item.id} style={{ background: '#fff', padding: '15px', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #fcd34d' }}>
                       <div>
                          <strong style={{ fontSize: '13px', color: '#111', display: 'block' }}>{nomeDaLoja} <span style={{color: '#999', fontSize: '10px', fontWeight: 'normal'}}>{dadosAjuste.hora_pedido}</span></strong>
                          <span style={{ fontSize: '14px', color: '#92400e' }}>
                             Alterar <b>{item.nome_produto}</b> de {item.quantidade} <span style={{color:'#d97706'}}>➔ Para <b>{dadosAjuste.qtd}</b></span>
                             {dadosAjuste.bonif > 0 && <span style={{color: '#166534', fontSize: '11px', display: 'block'}}>🎁 com {dadosAjuste.bonif} bonificados</span>}
                          </span>
                       </div>
                       <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => recusarAjusteItem(item)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>X RECUSAR</button>
                          <button onClick={() => aprovarAjusteItem(item)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}>✅ APROVAR</button>
                       </div>
                    </div>
                 );
              })}
            </div>
         </div>
      )}

      <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', borderTop: '8px solid #f97316', marginBottom: '40px' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '22px', textAlign: 'center', color: '#111' }}>FRAZÃO FRUTAS & CIA</h2>
        
        <div style={{ marginTop: '10px', marginBottom: '20px', padding: '12px', backgroundColor: lojasFaltantes === 0 ? '#dcfce7' : '#fef2f2', borderRadius: '12px', display: 'flex', justifyContent: 'space-around', fontSize: '13px', fontWeight: 'bold', color: lojasFaltantes === 0 ? '#166534' : '#991b1b', border: `1px solid ${lojasFaltantes === 0 ? '#bbf7d0' : '#fecaca'}` }}>
            <span>✅ {lojasQueEnviaramUnicas} Enviaram</span><span>|</span>
            <span>⏳ {lojasFaltantes} Faltam</span><span>|</span>
            <span>🏪 {totalLojasValidas} Total</span>
        </div>
        
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '16px', maxHeight: '300px', overflowY: 'auto', padding: '15px', border: '1px solid #eee' }}>
          {listaConsolidada.length === 0 ? (
            <div style={{textAlign: 'center', color: '#999', padding: '20px'}}>Nenhum pedido recebido para este dia.</div>
          ) : (
            listaConsolidada.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px dashed #e2e8f0' }}>
                <div>
                  <strong style={{ fontSize: '14px', display: 'block' }}>{formatarNomeItem(item.nome)}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: '10px' }}>Pedida por {item.qtdLojas} loja(s)</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ background: '#fef3c7', color: '#92400e', padding: '6px 12px', borderRadius: '10px', fontWeight: '900', fontSize: '16px', display: 'inline-block' }}>
                    {item.total} <small style={{fontSize: '11px'}}>{item.unidade}</small>
                  </div>
                  {item.bonifTotal > 0 && (
                     <div style={{ fontSize: '10px', color: '#166534', fontWeight: 'bold', marginTop: '4px' }}>🎁 +{item.bonifTotal} bonif.</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        
        <button onClick={copiarResumoGeral} style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: copiadoResumo ? '#22c55e' : '#f97316', color: 'white', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '15px', transition: '0.3s' }}>
          {copiadoResumo ? '✅ RESUMO COPIADO PARA COMPRAS!' : '📋 COPIAR RESUMO PARA COMPRAS'}
        </button>
      </div>

      <h3 style={{ marginLeft: '10px', color: '#333' }}>Status das Filiais</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '15px' }}>
        {lojas.filter(l => extrairNum(l.codigo_loja) >= 0).map(loja => {
          const idDestaLoja = extrairNum(loja.codigo_loja);
          const pedidosDaLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === idDestaLoja);
          const enviou = pedidosDaLoja.length > 0;
          const estaOnline = usuariosOnline[idDestaLoja];
          
          const solicitouRefazer = pedidosDaLoja.some(p => p.solicitou_refazer === true);
          const jaLiberada = pedidosDaLoja.some(p => p.liberado_edicao === true);
          const pedindoEdicaoItem = pedidosDaLoja.some(p => p.solicitou_edicao_item === true);
          
          let bordaCor = enviou ? '#22c55e' : '#f1f5f9';
          let textoCor = enviou ? '#22c55e' : '#ef4444';
          let textoStatus = enviou ? '● PEDIDO RECEBIDO' : '○ AGUARDANDO';
          let iconeStatus = enviou ? '✅' : '⏳';

          if (solicitouRefazer) {
             bordaCor = '#eab308'; textoCor = '#ca8a04'; textoStatus = '⚠️ PEDIU PARA EDITAR'; iconeStatus = '⚠️';
          } else if (pedindoEdicaoItem) {
             bordaCor = '#f97316'; textoCor = '#c2410c'; textoStatus = '✏️ CORREÇÃO PENDENTE'; iconeStatus = '✏️';
          } else if (jaLiberada) {
             bordaCor = '#3b82f6'; textoCor = '#2563eb'; textoStatus = '🔓 EDITANDO (CARRINHO)...'; iconeStatus = '✏️';
          }
          
          return (
            <div key={loja.id || idDestaLoja} onClick={() => enviou && setModalAberto(loja)} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '18px', border: `2px solid ${estaOnline ? '#a855f7' : bordaCor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: enviou ? 'pointer' : 'default', transition: 'all 0.2s', position: 'relative' }}>
              {estaOnline && (
                <div style={{position: 'absolute', top: '-10px', right: '15px', background: '#a855f7', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '6px', animation: 'pulse 2s infinite'}}>
                  ● ONLINE AGORA
                </div>
              )}
              <div>
                <strong style={{fontSize: '15px'}}>{loja.nome_fantasia}</strong>
                <span style={{display: 'block', fontSize: '11px', color: textoCor, fontWeight: 'bold', marginTop: '4px'}}>{textoStatus}</span>
              </div>
              <div style={{fontSize: '24px'}}>{estaOnline ? '📱' : iconeStatus}</div>
            </div>
          );
        })}
      </div>

      {modalRelatorioAberto && (
         <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 11000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
            <div style={{ backgroundColor: '#f8fafc', width: '100%', maxWidth: '600px', maxHeight: '85vh', borderRadius: '25px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
               <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                  <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>📊 Relatório de Edições do Dia</h3>
                  <button onClick={() => setModalRelatorioAberto(false)} style={{ background: '#e2e8f0', border: 'none', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
               </div>
               
               <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                  {historicoDeAjustes.length === 0 && pendenciasDeAjuste.length === 0 ? (
                     <div style={{ textAlign: 'center', color: '#94a3b8', padding: '50px 20px' }}>
                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>📭</div>
                        Nenhuma solicitação de edição foi feita hoje.
                     </div>
                  ) : (
                     <>
                        <h4 style={{marginTop: 0, color: '#64748b'}}>Aguardando Resposta:</h4>
                        {pendenciasDeAjuste.map(item => {
                           const nomeDaLoja = lojas.find(l => extrairNum(l.codigo_loja) === extrairNum(item.loja_id))?.nome_fantasia || `Loja`;
                           let dados = {}; try { dados = JSON.parse(item.texto_edicao_item); } catch(e){}
                           return (
                              <div key={`rel-${item.id}`} style={{ background: '#fffbeb', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #fde68a' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{fontSize: '14px', color: '#b45309'}}>{nomeDaLoja}</strong>
                                    <span style={{fontSize: '11px', fontWeight: 'bold', background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '10px'}}>PENDENTE</span>
                                 </div>
                                 <div style={{ fontSize: '13px', color: '#92400e', marginTop: '8px' }}>
                                    Solicitou alterar <b>{item.nome_produto}</b> para <b>{dados.qtd} {item.unidade_medida}</b>.
                                 </div>
                                 <div style={{ fontSize: '10px', color: '#b45309', marginTop: '5px' }}>👤 Pedido feito às {dados.hora_pedido} por {item.nome_usuario}</div>
                              </div>
                           );
                        })}

                        <h4 style={{marginTop: '20px', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '20px'}}>Histórico Resolvido:</h4>
                        {historicoDeAjustes.map(item => {
                           const nomeDaLoja = lojas.find(l => extrairNum(l.codigo_loja) === extrairNum(item.loja_id))?.nome_fantasia || `Loja`;
                           let dados = {}; try { dados = JSON.parse(item.texto_edicao_item); } catch(e){ return null; }
                           const aprovado = dados.status === 'aprovado';
                           
                           return (
                              <div key={`rel-hist-${item.id}`} style={{ background: '#fff', padding: '15px', borderRadius: '12px', marginBottom: '10px', borderLeft: `5px solid ${aprovado ? '#22c55e' : '#ef4444'}`, boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{fontSize: '14px', color: '#334155'}}>{nomeDaLoja}</strong>
                                    <span style={{fontSize: '11px', fontWeight: 'bold', color: aprovado ? '#16a34a' : '#dc2626'}}>{aprovado ? '✅ APROVADO' : '❌ RECUSADO'}</span>
                                 </div>
                                 <div style={{ fontSize: '13px', color: '#475569', marginTop: '8px' }}>
                                    Pediu para alterar <b>{item.nome_produto}</b> para <b>{dados.qtd} {item.unidade_medida}</b>.
                                 </div>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginTop: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                                    <span>👤 Pedido: {item.nome_usuario} ({dados.hora_pedido})</span>
                                    <span>⚙️ Analisado: {dados.quem_respondeu} ({dados.hora_resp})</span>
                                 </div>
                              </div>
                           );
                        }).reverse()}
                     </>
                  )}
               </div>
            </div>
         </div>
      )}

      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '420px', maxHeight: '85vh', borderRadius: '25px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '25px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{modalAberto.nome_fantasia}</h3>
                <span style={{fontSize: '11px', color: '#22c55e', fontWeight: 'bold'}}>RESPONSÁVEL: {lojaAbertaPedidos[0]?.nome_usuario || 'Operador'}</span>
              </div>
              <button onClick={() => setModalAberto(null)} style={{ border: 'none', background: '#e2e8f0', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {lojaAbertaPedidos.map((item, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{fontSize: '14px', fontWeight: 'bold'}}>{formatarNomeItem(String(item.nome || item.nome_produto || ""))}</span>
                    <div style={{textAlign: 'right'}}>
                       <span style={{background: '#111', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '14px'}}>
                         {item.quantidade} <small style={{fontSize:'10px', color: '#aaa'}}>{item.unidade || item.unidade_medida}</small>
                       </span>
                    </div>
                  </div>
                  {Number(item.qtd_bonificada) > 0 && (
                     <div style={{fontSize: '11px', color: '#166534', fontWeight: 'bold', textAlign: 'right'}}>🎁 +{item.qtd_bonificada} (Bonificação)</div>
                  )}
                  {item.solicitou_edicao_item && (
                     <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '8px', borderRadius: '8px', marginTop: '5px' }}>
                        <div style={{ fontSize: '10px', color: '#d97706', fontWeight: 'bold' }}>⚠️ Há uma solicitação pendente para este item. Resolva na Central de Aprovações no topo da tela.</div>
                     </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lojaAbertaJaLiberada ? (
                <button onClick={async () => {
                   await supabase.from('pedidos').update({ liberado_edicao: false }).eq('data_pedido', dataFiltro).eq('loja_id', extrairNum(modalAberto.codigo_loja));
                   setModalAberto(null); carregarDados();
                }} style={{ width: '100%', padding: '15px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  🔒 TRAVAR LISTA NOVAMENTE
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={liberarLojaParaRefazer} style={{ flex: 1, padding: '15px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>🔓 ABRIR CARRINHO</button>
                  <button onClick={copiarListaLoja} style={{ flex: 1, padding: '15px', backgroundColor: copiadoWpp ? '#16a34a' : '#25d366', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' }}>
                    {copiadoWpp ? '✅ COPIADO!' : '🟢 WHATSAPP'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}
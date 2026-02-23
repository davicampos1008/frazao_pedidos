import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Listas() {
  const [lojas, setLojas] = useState([]);
  const [pedidosDia, setPedidosDia] = useState([]);
  const [modalAberto, setModalAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const dataAtual = new Date();
  const hojeBanco = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}-${String(dataAtual.getDate()).padStart(2, '0')}`;

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros ? parseInt(apenasNumeros, 10) : null;
  };

  // 💡 FORMATADOR PARA PRIMEIRAS LETRAS MAIÚSCULAS
  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  async function carregarDados() {
    try {
      setCarregando(true);
      const { data: dLojas } = await supabase.from('lojas').select('*').order('nome_fantasia', { ascending: true });
      const { data: dPedidos } = await supabase.from('pedidos').select('*').eq('data_pedido', hojeBanco);
      
      setLojas(dLojas || []);
      setPedidosDia(dPedidos || []);
    } catch (err) { console.error("Erro:", err); } 
    finally { setCarregando(false); }
  }

  useEffect(() => { carregarDados(); }, []);

  const obterSomaTotal = () => {
    const mapa = {};
    pedidosDia.forEach(p => {
      const idLoja = extrairNum(p.loja_id);
      // Pega apenas pedidos que não estão soltos no carrinho (ou seja, se enviou, a gente soma)
      if (idLoja !== null && idLoja > 1 && p.liberado_edicao !== true) { 
        const nome = String(p.nome_produto || "Sem Nome").toUpperCase();
        if (!mapa[nome]) mapa[nome] = { nome, total: 0, unidade: p.unidade_medida || "UN", lojasQuePediram: new Set() };
        mapa[nome].total += Number(p.quantidade || 0);
        mapa[nome].lojasQuePediram.add(idLoja);
      }
    });
    return Object.values(mapa).map(item => ({ ...item, qtdLojas: item.lojasQuePediram.size })).sort((a, b) => a.nome.localeCompare(b.nome));
  };

  const listaConsolidada = obterSomaTotal();
  const idsQueEnviaram = pedidosDia.filter(p => p.liberado_edicao !== true).map(p => extrairNum(p.loja_id)).filter(id => id !== null);

  const totalLojasValidas = lojas.filter(l => extrairNum(l.codigo_loja) > 1).length;
  const lojasQueEnviaramUnicas = new Set(idsQueEnviaram.filter(id => id > 1)).size;
  const lojasFaltantes = totalLojasValidas - lojasQueEnviaramUnicas;

  const copiarResumoGeral = () => {
    if (listaConsolidada.length === 0) return alert("Nenhum pedido recebido ainda.");
    const cabecalho = "*FRAZÃO FRUTAS & CIA - RESUMO GERAL* 📋\nData: " + dataAtual.toLocaleDateString('pt-BR');
    // 💡 Nome formatado bonitinho
    const corpo = listaConsolidada.map(i => `- ${i.total} ${i.unidade} : ${formatarNomeItem(i.nome)} *(em ${i.qtdLojas} loja${i.qtdLojas > 1 ? 's' : ''})*`).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    alert("✅ Resumo copiado!");
  };

  const copiarListaLoja = () => {
    const pLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja));
    const nomeOperador = pLoja.length > 0 ? pLoja[0].nome_usuario : 'Operador';
    const cabecalho = `*LOJA:* ${modalAberto.nome_fantasia}\n*RESPONSÁVEL:* ${nomeOperador}`;
    // 💡 Nome formatado bonitinho
    const corpo = pLoja.map(i => `- ${i.quantidade} ${String(i.unidade || i.unidade_medida).toUpperCase()} : ${formatarNomeItem(String(i.nome || i.nome_produto))}`).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    alert("✅ Lista copiada!");
  };

  // 💡 V.I.R.T.U.S: Libera a lista para a filial voltar pro carrinho (MANTÉM OS DADOS)
  const liberarLojaParaRefazer = async () => {
    if(window.confirm(`Liberar a loja ${modalAberto.nome_fantasia} para editar a lista?\n\nOs itens voltarão para o carrinho do aplicativo deles sem apagar as quantidades.`)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos')
          .update({ solicitou_refazer: false, liberado_edicao: true })
          .eq('data_pedido', hojeBanco)
          .eq('loja_id', extrairNum(modalAberto.codigo_loja));
          
        alert("✅ Loja liberada! A lista voltou pro carrinho deles.");
        setModalAberto(null);
        carregarDados();
      } catch (err) {
        alert("Erro: " + err.message);
        setCarregando(false);
      }
    }
  };

  const apagarListaLoja = async () => {
    if(window.confirm(`🚨 ATENÇÃO: Tem certeza que deseja APAGAR COMPLETAMENTE a lista enviada pela loja ${modalAberto.nome_fantasia}?\n\nEles terão que fazer os pedidos todos do zero.`)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos')
          .delete()
          .eq('data_pedido', hojeBanco)
          .eq('loja_id', extrairNum(modalAberto.codigo_loja));
          
        alert("🗑️ Lista apagada com sucesso!");
        setModalAberto(null);
        carregarDados();
      } catch (err) {
        alert("Erro ao apagar: " + err.message);
        setCarregando(false);
      }
    }
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando painel...</div>;

  const lojaAbertaPedidos = modalAberto ? pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja)) : [];
  const lojaAbertasolicitouRefazer = lojaAbertaPedidos.some(p => p.solicitou_refazer === true);
  const lojaAbertaJaLiberada = lojaAbertaPedidos.some(p => p.liberado_edicao === true);

  return (
    <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px' }}>
      
      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: '20px', color: 'white', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{margin: 0, fontSize: '18px'}}>📋 PAINEL DE CONFERÊNCIA</h2>
          <span style={{fontSize: '11px', color: '#999'}}>Data: {dataAtual.toLocaleDateString('pt-BR')}</span>
        </div>
        <button onClick={carregarDados} style={{background: '#333', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold'}}>🔄</button>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', borderTop: '8px solid #f97316', marginBottom: '40px' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '22px', textAlign: 'center', color: '#111' }}>FRAZÃO FRUTAS & CIA</h2>
        
        <div style={{ marginTop: '10px', marginBottom: '20px', padding: '12px', backgroundColor: lojasFaltantes === 0 ? '#dcfce7' : '#fef2f2', borderRadius: '12px', display: 'flex', justifyContent: 'space-around', fontSize: '13px', fontWeight: 'bold', color: lojasFaltantes === 0 ? '#166534' : '#991b1b', border: `1px solid ${lojasFaltantes === 0 ? '#bbf7d0' : '#fecaca'}` }}>
           <span>✅ {lojasQueEnviaramUnicas} Enviaram</span><span>|</span>
           <span>⏳ {lojasFaltantes} Faltam</span><span>|</span>
           <span>🏪 {totalLojasValidas} Total</span>
        </div>
        
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '16px', maxHeight: '300px', overflowY: 'auto', padding: '15px', border: '1px solid #eee' }}>
          {listaConsolidada.length === 0 ? (
            <div style={{textAlign: 'center', color: '#999', padding: '20px'}}>Nenhum pedido recebido e finalizado ainda.</div>
          ) : (
            listaConsolidada.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px dashed #e2e8f0' }}>
                <div>
                  <strong style={{ fontSize: '14px', display: 'block' }}>{formatarNomeItem(item.nome)}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: '10px' }}>Pedida por {item.qtdLojas} loja(s)</span>
                </div>
                <div style={{ background: '#fef3c7', color: '#92400e', padding: '6px 12px', borderRadius: '10px', fontWeight: '900', fontSize: '16px' }}>
                  {item.total} <small style={{fontSize: '11px'}}>{item.unidade}</small>
                </div>
              </div>
            ))
          )}
        </div>
        <button onClick={copiarResumoGeral} style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '15px' }}>
          📋 COPIAR RESUMO PARA COMPRAS
        </button>
      </div>

      <h3 style={{ marginLeft: '10px', color: '#333' }}>Status das Filiais</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '15px' }}>
        
        {lojas.filter(l => extrairNum(l.codigo_loja) > 1).map(loja => {
          const idDestaLoja = extrairNum(loja.codigo_loja);
          const pedidosDaLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === idDestaLoja);
          const enviou = pedidosDaLoja.length > 0;
          
          const solicitouRefazer = pedidosDaLoja.some(p => p.solicitou_refazer === true);
          const jaLiberada = pedidosDaLoja.some(p => p.liberado_edicao === true);
          
          let bordaCor = enviou ? '#22c55e' : '#f1f5f9';
          let textoCor = enviou ? '#22c55e' : '#ef4444';
          let textoStatus = enviou ? '● PEDIDO RECEBIDO' : '○ AGUARDANDO';
          let iconeStatus = enviou ? '✅' : '⏳';

          if (solicitouRefazer) {
            bordaCor = '#eab308'; textoCor = '#ca8a04'; textoStatus = '⚠️ PEDIU PARA EDITAR'; iconeStatus = '⚠️';
          } else if (jaLiberada) {
            bordaCor = '#3b82f6'; textoCor = '#2563eb'; textoStatus = '🔓 EDITANDO (CARRINHO)...'; iconeStatus = '✏️';
          }
          
          return (
            <div key={loja.id} onClick={() => enviou && setModalAberto(loja)} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '18px', border: `2px solid ${bordaCor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: enviou ? 'pointer' : 'default', transition: 'all 0.2s', boxShadow: enviou ? '0 4px 15px rgba(0,0,0,0.05)' : 'none' }}>
              <div>
                <strong style={{fontSize: '15px'}}>{loja.nome_fantasia}</strong>
                <span style={{display: 'block', fontSize: '11px', color: textoCor, fontWeight: 'bold', marginTop: '4px'}}>{textoStatus}</span>
              </div>
              <div style={{fontSize: '24px'}}>{iconeStatus}</div>
            </div>
          );
        })}

      </div>

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
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{fontSize: '14px', fontWeight: 'bold'}}>{formatarNomeItem(String(item.nome || item.nome_produto || ""))}</span>
                  <span style={{background: '#111', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '14px'}}>
                    {item.quantidade} <small style={{fontSize:'10px', color: '#aaa'}}>{item.unidade || item.unidade_medida}</small>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {lojaAbertaJaLiberada ? (
                 <div style={{textAlign: 'center', padding: '10px', color: '#2563eb', fontWeight: 'bold', fontSize: '12px', backgroundColor: '#eff6ff', borderRadius: '12px'}}>
                   A loja está com a lista destrancada no aplicativo deles.
                 </div>
              ) : (
                <>
                  {lojaAbertasolicitouRefazer && (
                    <div style={{textAlign: 'center', padding: '5px', color: '#d97706', fontWeight: 'bold', fontSize: '12px'}}>
                      ⚠️ A loja solicitou permissão para alterar o pedido!
                    </div>
                  )}
                  
                  {/* 💡 O NOVO BOTÃO DE DEVOLVER PRO CARRINHO SEM APAGAR */}
                  <button onClick={liberarLojaParaRefazer} style={{ width: '100%', padding: '15px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                    🔓 DEVOLVER PARA O CARRINHO (EDITAR)
                  </button>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={copiarListaLoja} style={{ flex: 2, padding: '15px', backgroundColor: '#25d366', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                      🟢 COPIAR (WPP)
                    </button>
                    <button onClick={apagarListaLoja} style={{ flex: 1, padding: '15px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                      🗑️ APAGAR
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
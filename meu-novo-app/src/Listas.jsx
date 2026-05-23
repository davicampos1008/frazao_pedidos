import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const ORDEM_LOJAS = [
  "FLAMINGO", "PARANOÁ", "411", "404", "QE15", "QE30", 
  "QUALIDADE", "XEPA", "MANSÕES", "Q6", "VARJÃO", "215", "313", "307"
];

const ordenarLojas = (lojasArray) => {
  if (!Array.isArray(lojasArray)) return lojasArray;
  return [...lojasArray].sort((a, b) => {
    const nA = String(a.nome_fantasia || a.loja || a.nome || a.nome_loja || "").toUpperCase();
    const nB = String(b.nome_fantasia || b.loja || b.nome || b.nome_loja || "").toUpperCase();
    
    if (nA.includes('FRAZÃO')) return -1;
    if (nB.includes('FRAZÃO')) return 1;

    let iA = ORDEM_LOJAS.findIndex(nome => nA.includes(nome));
    let iB = ORDEM_LOJAS.findIndex(nome => nB.includes(nome));
    
    if (iA === -1) iA = 999;
    if (iB === -1) iB = 999;
    
    return iA - iB;
  });
};

export default function Listas() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const calcularDataPosterior = (dataString) => {
    if (!dataString) return '';
    const [ano, mes, dia] = dataString.split('-');
    const dataObj = new Date(ano, mes - 1, dia);
    dataObj.setDate(dataObj.getDate() + 1);
    return dataObj.toLocaleDateString('pt-BR');
  };

  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_listas_data') || obterDataLocal();
  });
  const dataBr = dataFiltro.split('-').reverse().join('/');

  useEffect(() => {
    localStorage.setItem('virtus_listas_data', dataFiltro);
    carregarDados();

    const intervalo = setInterval(() => {
        carregarDados(true); 
    }, 1000);

    return () => clearInterval(intervalo);
  }, [dataFiltro]);

  const [lojas, setLojas] = useState([]);
  const [pedidosDia, setPedidosDia] = useState([]);
  const [produtosBd, setProdutosBd] = useState([]); 
  const [modalAberto, setModalAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [editandoLista, setEditandoLista] = useState(false);
  const [listaEditada, setListaEditada] = useState({});

  const [modalDevolverAberto, setModalDevolverAberto] = useState(false);
  const [historicoDevolver, setHistoricoDevolver] = useState([]);
  const [lojaParaDevolver, setLojaParaDevolver] = useState(null);
  const [snapshotSelecionado, setSnapshotSelecionado] = useState(null);

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  async function carregarDados(silencioso = false) {
    try {
      if (!silencioso) setCarregando(true);
      
      const { data: dLojas } = await supabase.from('lojas').select('*').order('nome_fantasia', { ascending: true });
      const { data: dPedidos } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro); 
      const { data: dProdutos } = await supabase.from('produtos').select('id, nome, preco, peso_caixa, unidade_medida'); 
      
      let lojasDb = dLojas || [];
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }

      setLojas(ordenarLojas(lojasDb));
      setPedidosDia(dPedidos || []);
      setProdutosBd(dProdutos || []); 
    } catch (err) { 
      console.error("Erro:", err); 
    } finally { 
      if (!silencioso) setCarregando(false);
    }
  }

  const obterSomaTotal = () => {
    const mapa = {};
    pedidosDia.forEach(p => {
      const idLoja = extrairNum(p.loja_id);
      if (idLoja !== null && idLoja >= 0 && p.liberado_edicao !== true) { 
        const nome = String(p.nome_produto || "Sem Nome").toUpperCase();
        if (!mapa[nome]) mapa[nome] = { nome, total: 0, unidade: p.unidade_medida || "UN", lojasQuePediram: new Set() };
        mapa[nome].total += Number(p.quantidade || 0);
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
    const cabecalho = "*FRAZÃO FRUTAS & CIA - RESUMO GERAL* 📋\nData: " + dataBr; 
    const corpo = listaConsolidada.map(i => `- ${i.total} ${i.unidade} : ${formatarNomeItem(i.nome)} *(em ${i.qtdLojas} loja${i.qtdLojas > 1 ? 's' : ''})*`).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    alert("✅ Resumo copiado!");
  };

  const copiarListaLoja = () => {
    const pLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja));
    const nomeOperador = pLoja.length > 0 ? pLoja[0].nome_usuario : 'Operador';
    const cabecalho = `*LOJA:* ${modalAberto.nome_fantasia}\n*RESPONSÁVEL:* ${nomeOperador}`;
    const corpo = pLoja.map(i => {
        let texto = `- ${i.quantidade} ${String(i.unidade || i.unidade_medida).toUpperCase()} : ${formatarNomeItem(String(i.nome || i.nome_produto))}`;
        if (i.qtd_bonificada_cliente > 0) {
            texto += ` (🎁 Pediu +${i.qtd_bonificada_cliente} Bonif.)`;
        }
        return texto;
    }).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    alert("✅ Lista copiada!");
  };

  const liberarLojaParaRefazer = async () => {
    if(window.confirm(`Liberar a loja ${modalAberto.nome_fantasia} para editar a lista?\n\nOs itens voltarão para o carrinho do aplicativo deles sem apagar as quantidades.`)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos')
          .update({ solicitou_refazer: false, liberado_edicao: true })
          .eq('data_pedido', dataFiltro) 
          .eq('loja_id', extrairNum(modalAberto.codigo_loja));
          
        alert("✅ Loja liberada! A lista voltou pro carrinho deles.");
        fecharModal();
        carregarDados();
      } catch (err) {
        alert("Erro: " + err.message);
        setCarregando(false);
      }
    }
  };

  const cancelarEdicaoLoja = async () => {
    if(window.confirm(`Deseja CANCELAR a edição da loja ${modalAberto.nome_fantasia}?\n\nA lista será trancada novamente e o pedido voltará a valer como "Enviado".`)) {
      setCarregando(true);
      try {
        await supabase.from('pedidos')
          .update({ liberado_edicao: false })
          .eq('data_pedido', dataFiltro) 
          .eq('loja_id', extrairNum(modalAberto.codigo_loja));
          
        alert("🔒 Edição cancelada! A lista foi trancada e o pedido voltou ao normal.");
        fecharModal();
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
          .eq('data_pedido', dataFiltro) 
          .eq('loja_id', extrairNum(modalAberto.codigo_loja));
          
        alert("🗑️ Lista apagada com sucesso!");
        fecharModal();
        carregarDados();
      } catch (err) {
        alert("Erro ao apagar: " + err.message);
        setCarregando(false);
      }
    }
  };

  const iniciarEdicaoLocal = () => {
    const mapData = {};
    const lojaAbertaPedidos = modalAberto ? pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja)) : [];
    lojaAbertaPedidos.forEach(p => {
      mapData[p.id] = {
        quantidade: p.quantidade,
        nome: String(p.nome || p.nome_produto || "")
      };
    });
    setListaEditada(mapData);
    setEditandoLista(true);
  };

  const deletarItemUnicoLocal = async (idPedido, nomeItem) => {
    if(!window.confirm(`Tem certeza que deseja REMOVER "${nomeItem}" desta loja?`)) return;
    
    setCarregando(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('logs_carrinho').insert([{
            loja_id: extrairNum(modalAberto.codigo_loja),
            login_responsavel: user?.email || 'Equipe Adm',
            acao: 'APAGOU ITEM (EQUIPE)',
            item_nome: nomeItem,
            quantidade: 0
        }]);

        await supabase.from('pedidos').delete().eq('id', idPedido);
        
        const novaListaEditada = { ...listaEditada };
        delete novaListaEditada[idPedido];
        setListaEditada(novaListaEditada);
        
        carregarDados(); 
    } catch(e) {
        alert("Erro ao remover o item: " + e.message);
        setCarregando(false);
    }
  };

  const salvarEdicaoLocal = async () => {
    setCarregando(true);
    try {
      const promessas = [];
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.email || 'Equipe Adm';

      for (const idPedido of Object.keys(listaEditada)) {
        const itemAntes = pedidosDia.find(p => p.id === parseInt(idPedido));
        const itemAgora = listaEditada[idPedido];

        if (itemAntes && (Number(itemAntes.quantidade) !== Number(itemAgora.quantidade) || itemAntes.nome_produto !== itemAgora.nome.toUpperCase())) {
            promessas.push(
                supabase.from('logs_carrinho').insert([{
                    loja_id: extrairNum(modalAberto.codigo_loja),
                    login_responsavel: userName,
                    acao: `MODIFICOU ITEM (EQUIPE) [De: ${itemAntes.quantidade}x ${itemAntes.nome_produto} Para: ${itemAgora.quantidade}x ${itemAgora.nome.toUpperCase()}]`,
                    item_nome: itemAgora.nome.toUpperCase(),
                    quantidade: Number(itemAgora.quantidade)
                }])
            );
        }

        promessas.push(
          supabase.from('pedidos')
          .update({ 
              quantidade: Number(itemAgora.quantidade),
              nome_produto: itemAgora.nome.toUpperCase() 
          })
          .eq('id', idPedido) 
        );
      }
      await Promise.all(promessas);
      alert("✅ Lista atualizada com sucesso!");
      setEditandoLista(false);
      carregarDados();
    } catch (err) {
      alert("Erro ao salvar: " + err.message);
      setCarregando(false);
    }
  };

  const puxarHistoricoLogCarrinho = async (lojaCodigo, nomeLoja) => {
    try {
      const { data, error } = await supabase
        .from('logs_carrinho')
        .select('*')
        .eq('loja_id', lojaCodigo)
        .gte('created_at', `${dataFiltro}T00:00:00Z`)
        .lte('created_at', `${dataFiltro}T23:59:59Z`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return alert(`Nenhum registro de atividade encontrado no carrinho da loja ${nomeLoja} para a data ${dataBr}.`);
      }

      let resumoLog = `*HISTÓRICO DO CARRINHO - ${nomeLoja}*\nData: ${dataBr}\n\n`;

      data.forEach((log) => {
        const hora = new Date(log.created_at).toLocaleTimeString('pt-BR');
        let textoAcao = `[${hora}] ${log.login_responsavel} ${log.acao}: ${log.quantidade}x ${formatarNomeItem(log.item_nome)}`;
        if (log.qtd_bonificada && Number(log.qtd_bonificada) > 0) {
            textoAcao += ` (🎁 +${log.qtd_bonificada} Bonif.)`;
        }
        resumoLog += textoAcao + '\n';
      });

      navigator.clipboard.writeText(resumoLog);
      alert("✅ Histórico copiado para a área de transferência!");

    } catch (err) {
      alert("Erro ao puxar histórico: " + err.message);
    }
  };

  const verHistoricoEquipe = async (lojaAlvo) => {
      setCarregando(true);
      try {
          const { data: logs, error } = await supabase
              .from('logs_carrinho')
              .select('*')
              .eq('loja_id', extrairNum(lojaAlvo.codigo_loja))
              .ilike('acao', '%(EQUIPE)%')
              .gte('created_at', `${dataFiltro}T00:00:00Z`)
              .lte('created_at', `${dataFiltro}T23:59:59Z`)
              .order('created_at', { ascending: true });

          if (error) throw error;

          if (!logs || logs.length === 0) {
              alert(`Nenhuma modificação feita pela equipe na loja ${lojaAlvo.nome_fantasia} hoje.`);
              setCarregando(false);
              return;
          }

          let resumoHistorico = `*HISTÓRICO DE MODIFICAÇÕES DA EQUIPE - ${lojaAlvo.nome_fantasia}*\nData: ${dataBr}\n\n`;

          logs.forEach(log => {
              const hora = new Date(log.created_at).toLocaleTimeString('pt-BR');
              resumoHistorico += `[${hora}] ${log.login_responsavel}\n👉 ${log.acao}\n\n`;
          });

          navigator.clipboard.writeText(resumoHistorico);
          alert("✅ Histórico da equipe copiado para a área de transferência!");
          setCarregando(false);
      } catch (err) {
          alert("Erro ao buscar histórico da equipe: " + err.message);
          setCarregando(false);
      }
  };

  const abrirModalDevolver = async (lojaAlvo) => {
      setCarregando(true);
      try {
          const { data: logs, error } = await supabase
              .from('logs_carrinho')
              .select('*')
              .eq('loja_id', extrairNum(lojaAlvo.codigo_loja))
              .gte('created_at', `${dataFiltro}T00:00:00Z`)
              .lte('created_at', `${dataFiltro}T23:59:59Z`)
              .order('created_at', { ascending: true });

          if (error) throw error;

          let cart = {};
          const historyStates = [];

          (logs || []).forEach(log => {
              if (log.acao === 'ZEROU CARRINHO' || log.acao === 'ENVIOU PEDIDO') {
                  cart = {};
              } else if (log.acao === 'REMOVEU' || log.acao.includes('APAGOU')) {
                  delete cart[log.item_nome];
              } else {
                  cart[log.item_nome] = {
                      quantidade: log.quantidade,
                      qtd_bonificada: log.qtd_bonificada || 0
                  };
              }

              historyStates.push({
                  logId: log.id,
                  hora: log.created_at,
                  acao: log.acao,
                  responsavel: log.login_responsavel,
                  item_nome: log.item_nome,
                  quantidade: log.quantidade,
                  qtd_bonificada: log.qtd_bonificada || 0,
                  estadoCarrinho: JSON.parse(JSON.stringify(cart))
              });
          });

          setHistoricoDevolver(historyStates.reverse());
          setLojaParaDevolver(lojaAlvo);
          setModalDevolverAberto(true);
      } catch (err) {
          alert("Erro ao puxar histórico: " + err.message);
      } finally {
          setCarregando(false);
      }
  };

  const confirmarDevolucao = async (snapshot) => {
      if (!window.confirm("🚨 ATENÇÃO: Deseja devolver exatamente ESTA VERSÃO do carrinho para o cliente?\n\nOs itens voltarão para o aplicativo dele exatamente como estavam neste momento.")) return;
      
      setCarregando(true);
      try {
          const lojaId = extrairNum(lojaParaDevolver.codigo_loja);
          const cartItems = snapshot.estadoCarrinho;
          const payloadNuvem = [];

          let textoCopia = `*ITENS DEVOLVIDOS - ${lojaParaDevolver.nome_fantasia}*\n\n`;

          Object.keys(cartItems).forEach(nomeItem => {
              const prodOriginal = produtosBd.find(p => p.nome === nomeItem);
              const itemCart = cartItems[nomeItem];

              if (prodOriginal) {
                  let pUnit = parseFloat(String(prodOriginal.preco || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
                  let precoFinalItem = pUnit;
                  let undFinal = prodOriginal.unidade_medida || 'UN';

                  const temPesoExtra = prodOriginal.peso_caixa && String(prodOriginal.peso_caixa).trim() !== '';
                  const numeroPeso = temPesoExtra ? parseFloat(String(prodOriginal.peso_caixa).replace(/[^\d.]/g, '')) : 0;
                  
                  if (temPesoExtra && numeroPeso > 0) {
                      precoFinalItem = pUnit * numeroPeso;
                      if (undFinal === 'KG') undFinal = 'CX'; 
                  }

                  const bonif = Number(itemCart.qtd_bonificada) || 0;
                  const qtdBruta = Number(itemCart.quantidade) || 0;
                  const qtdCobrada = Math.max(0, qtdBruta - bonif);

                  payloadNuvem.push({
                      loja_id: lojaId,
                      produto_id: prodOriginal.id,
                      nome: prodOriginal.nome,
                      quantidade: qtdBruta,
                      qtd_bonificada: bonif,
                      valorUnit: precoFinalItem,
                      total: precoFinalItem * qtdCobrada,
                      unidade_medida: undFinal
                  });

                  textoCopia += `- ${qtdBruta}x ${formatarNomeItem(nomeItem)} `;
                  if (bonif > 0) textoCopia += `(🎁 ${bonif} Bonif.)`;
                  textoCopia += '\n';
              }
          });

          if (payloadNuvem.length > 0) {
              await supabase.from('carrinho_nuvem').delete().eq('loja_id', lojaId);
              const { error: errNuvem } = await supabase.from('carrinho_nuvem').insert(payloadNuvem);
              if (errNuvem) throw errNuvem;
          }

          await supabase.from('pedidos').delete().eq('data_pedido', dataFiltro).eq('loja_id', lojaId);

          navigator.clipboard.writeText(textoCopia);
          alert("✅ Carrinho devolvido com sucesso! A lista de itens foi copiada para o WhatsApp.");
          
          setModalDevolverAberto(false);
          setSnapshotSelecionado(null);
          fecharModal();
          carregarDados();
      } catch (err) {
          alert("Erro ao forçar retorno: " + err.message);
          setCarregando(false);
      }
  };

  const fecharModal = () => {
    setModalAberto(null);
    setEditandoLista(false);
  };

  if (carregando && !pedidosDia.length) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando painel...</div>;

  const lojaAbertaPedidos = modalAberto ? pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(modalAberto.codigo_loja) && (!editandoLista || listaEditada[p.id])) : [];
  const lojaAbertasolicitouRefazer = lojaAbertaPedidos.some(p => p.solicitou_refazer === true);
  const lojaAbertaJaLiberada = lojaAbertaPedidos.some(p => p.liberado_edicao === true);

  return (
    <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px' }}>
      
      <datalist id="lista-produtos">
        {produtosBd.map((p, i) => (
          <option key={i} value={p.nome} />
        ))}
      </datalist>

      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: '20px', color: 'white', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{margin: 0, fontSize: '18px'}}>📋 PAINEL DE CONFERÊNCIA</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>Data:</span>
            <input 
              type="date" 
              value={dataFiltro} 
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
            />
            {dataFiltro !== obterDataLocal() && (
              <button 
                onClick={() => setDataFiltro(obterDataLocal())} 
                style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                🗓️ VOLTAR PARA HOJE
              </button>
            )}
          </div>
        </div>
        <button onClick={() => carregarDados()} style={{background: '#333', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold'}}>🔄</button>
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
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '4px' }}>
                     <span style={{ fontSize: '10px', color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>Pedida por {item.qtdLojas} loja(s)</span>
                     {item.totalBonificacoesCliente > 0 && (
                        <span style={{ fontSize: '10px', color: item.statusBonificacao === 'aceita' ? '#16a34a' : item.statusBonificacao === 'rejeitada' ? '#ef4444' : '#d97706', background: item.statusBonificacao === 'aceita' ? '#dcfce7' : item.statusBonificacao === 'rejeitada' ? '#fef2f2' : '#fef3c7', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', display: 'flex', gap: '4px', alignItems: 'center' }}>
                            🎁 {item.totalBonificacoesCliente} Bonif. 
                            {item.statusBonificacao === 'aceita' && '✅'}
                            {item.statusBonificacao === 'rejeitada' && '❌'}
                            {item.statusBonificacao === 'pendente' && '⏳'}
                            {item.statusBonificacao === 'parcial' && '⚠️'}
                        </span>
                     )}
                  </div>
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
        
        {lojas.filter(l => extrairNum(l.codigo_loja) >= 0).map(loja => {
          const idDestaLoja = extrairNum(loja.codigo_loja);
          const pedidosDaLoja = pedidosDia.filter(p => extrairNum(p.loja_id) === idDestaLoja);
          const enviou = pedidosDaLoja.length > 0;
          
          const solicitouRefazer = pedidosDaLoja.some(p => p.solicitou_refazer === true);
          const jaLiberada = pedidosDaLoja.some(p => p.liberado_edicao === true);
          const isLojaTeste = idDestaLoja === 0;
          
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
            <div key={loja.id || idDestaLoja} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '18px', border: `2px solid ${bordaCor}`, display: 'flex', flexDirection: 'column', gap: '15px', transition: 'all 0.2s', boxShadow: enviou ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', position: 'relative' }}>
              {isLojaTeste && <div style={{position: 'absolute', top: '-10px', left: '15px', background: '#22c55e', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '6px'}}>🛠️ MODO TESTE</div>}
              
              <div onClick={() => enviou && setModalAberto(loja)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: enviou ? 'pointer' : 'default' }}>
                <div>
                  <strong style={{fontSize: '15px'}}>{loja.nome_fantasia}</strong>
                  <span style={{display: 'block', fontSize: '11px', color: textoCor, fontWeight: 'bold', marginTop: '4px'}}>{textoStatus}</span>
                </div>
                <div style={{fontSize: '24px'}}>{iconeStatus}</div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px dashed #e2e8f0', paddingTop: '15px' }}>
                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          puxarHistoricoLogCarrinho(loja.codigo_loja, loja.nome_fantasia);
                      }}
                      style={{ flex: 1, background: '#8b5cf6', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      title="Copiar Histórico de Ações"
                  >
                      📜 HISTÓRICO
                  </button>

                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          abrirModalDevolver(loja);
                      }}
                      style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      title="Devolve o pedido que foi finalizado de volta ao carrinho"
                  >
                      📥 DEVOLVER
                  </button>

                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          verHistoricoEquipe(loja);
                      }}
                      style={{ flex: 1, background: '#111', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      title="Mostra quem da equipe alterou o pedido"
                  >
                      🧑‍💻 EQUIPE
                  </button>
              </div>
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
              <button onClick={fecharModal} style={{ border: 'none', background: '#e2e8f0', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {lojaAbertaPedidos.map((item, i) => {
                 const bonifPedida = Number(item.qtd_bonificada_cliente) || 0;
                 const bonifAceita = Number(item.qtd_bonificada) || 0;
                 const isPendente = item.status_compra === 'pendente';
                 
                 let statusBonif = '';
                 let corBonif = '';
                 let fundoBonif = '';
                 if (bonifPedida > 0) {
                     if (isPendente) {
                         statusBonif = '⏳ Pendente';
                         corBonif = '#d97706';
                         fundoBonif = '#fef3c7';
                     } else if (bonifAceita >= bonifPedida) {
                         statusBonif = '✅ Aceita';
                         corBonif = '#16a34a';
                         fundoBonif = '#dcfce7';
                     } else if (bonifAceita > 0) {
                         statusBonif = `⚠️ Parcial (${bonifAceita})`;
                         corBonif = '#ea580c';
                         fundoBonif = '#ffedd5';
                     } else {
                         statusBonif = '❌ Recusada';
                         corBonif = '#ef4444';
                         fundoBonif = '#fef2f2';
                     }
                 }

                 return (
                    <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      
                      {editandoLista ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                            <button onClick={() => deletarItemUnicoLocal(item.id, listaEditada[item.id]?.nome || item.nome)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️</button>
                            
                            <input 
                              list="lista-produtos"
                              placeholder="Pesquisar produto..."
                              type="text" 
                              value={listaEditada[item.id]?.nome || ''} 
                              onChange={(e) => setListaEditada({...listaEditada, [item.id]: { ...listaEditada[item.id], nome: e.target.value }})} 
                              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #ccc', fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }} 
                            />
                          </div>
                          <input 
                            type="number" 
                            value={listaEditada[item.id]?.quantidade !== undefined ? listaEditada[item.id].quantidade : item.quantidade} 
                            onChange={(e) => setListaEditada({...listaEditada, [item.id]: { ...listaEditada[item.id], quantidade: e.target.value }})} 
                            style={{ width: '60px', padding: '8px', textAlign: 'center', borderRadius: '8px', border: '1px solid #ccc', fontWeight: 'bold', fontSize: '14px' }} 
                          />
                        </>
                      ) : (
                        <>
                          <div>
                             <span style={{fontSize: '14px', fontWeight: 'bold', display: 'block'}}>{formatarNomeItem(String(item.nome || item.nome_produto || ""))}</span>
                             {bonifPedida > 0 && (
                                <div style={{display: 'flex', gap: '5px', alignItems: 'center', marginTop: '4px'}}>
                                   <span style={{fontSize: '10px', color: '#d97706', fontWeight: 'bold'}}>
                                      🎁 Pediu {bonifPedida} Bonif.
                                   </span>
                                   <span style={{fontSize: '9px', background: fundoBonif, color: corBonif, padding: '2px 6px', borderRadius: '6px', fontWeight: 'bold'}}>
                                      {statusBonif}
                                   </span>
                                </div>
                             )}
                          </div>
                          <span style={{background: '#111', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '14px'}}>
                            {item.quantidade} <small style={{fontSize:'10px', color: '#aaa'}}>{item.unidade || item.unidade_medida}</small>
                          </span>
                        </>
                      )}
                    </div>
                 )
              })}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {editandoLista ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={salvarEdicaoLocal} style={{ flex: 1, padding: '15px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                    💾 SALVAR
                  </button>
                  <button onClick={() => setEditandoLista(false)} style={{ flex: 1, padding: '15px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                    ❌ CANCELAR
                  </button>
                </div>
              ) : lojaAbertaJaLiberada ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{textAlign: 'center', padding: '10px', color: '#2563eb', fontWeight: 'bold', fontSize: '12px', backgroundColor: '#eff6ff', borderRadius: '12px'}}>
                    A loja está com a lista destrancada no aplicativo deles.
                  </div>
                  <button onClick={cancelarEdicaoLoja} style={{ width: '100%', padding: '15px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                    🔒 CANCELAR EDIÇÃO (TRAVAR LISTA)
                  </button>
                </div>
              ) : (
                <>
                  {lojaAbertasolicitouRefazer && (
                    <div style={{textAlign: 'center', padding: '5px', color: '#d97706', fontWeight: 'bold', fontSize: '12px'}}>
                      ⚠️ A loja solicitou permissão para alterar o pedido!
                    </div>
                  )}
                  
                  <button onClick={iniciarEdicaoLocal} style={{ width: '100%', padding: '15px', backgroundColor: '#111', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                    ✏️ EDITAR ITENS (NÓS MESMOS)
                  </button>

                  <button onClick={liberarLojaParaRefazer} style={{ width: '100%', padding: '15px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                    🔓 LIBERAR LOJA PARA EDITAR
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

      {/* 💡 MÁQUINA DO TEMPO (MODAL DE DEVOLVER) */}
      {modalDevolverAberto && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 12000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
              <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '25px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  
                  <div style={{ padding: '25px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                      <div>
                          <h3 style={{ margin: 0, fontSize: '18px' }}>MÁQUINA DO TEMPO (DEVOLVER)</h3>
                          <span style={{fontSize: '12px', color: '#f97316', fontWeight: 'bold'}}>Selecione a versão exata do carrinho que deseja devolver para o cliente.</span>
                      </div>
                      <button onClick={() => {setModalDevolverAberto(false); setSnapshotSelecionado(null);}} style={{ border: 'none', background: '#e2e8f0', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                  </div>

                  <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                      {/* Lado Esquerdo: Lista de Snaphots */}
                      <div style={{ width: '45%', borderRight: '1px solid #eee', overflowY: 'auto', padding: '15px', background: '#f1f5f9' }}>
                          <h4 style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#64748b' }}>Linha do Tempo de Ações:</h4>
                          
                          {historicoDevolver.length === 0 ? (
                              <div style={{textAlign: 'center', color: '#999', fontSize: '12px', padding: '20px'}}>Nenhum histórico encontrado para hoje.</div>
                          ) : (
                              historicoDevolver.map((snap, i) => (
                                  <div 
                                      key={i} 
                                      onClick={() => setSnapshotSelecionado(snap)}
                                      style={{ 
                                          backgroundColor: snapshotSelecionado?.logId === snap.logId ? '#e0e7ff' : '#fff', 
                                          border: `2px solid ${snapshotSelecionado?.logId === snap.logId ? '#3b82f6' : '#e2e8f0'}`, 
                                          padding: '12px', 
                                          borderRadius: '12px', 
                                          marginBottom: '10px', 
                                          cursor: 'pointer',
                                          boxShadow: snapshotSelecionado?.logId === snap.logId ? '0 4px 10px rgba(59,130,246,0.1)' : 'none'
                                      }}
                                  >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#3b82f6' }}>
                                              {new Date(snap.hora).toLocaleTimeString('pt-BR')}
                                          </span>
                                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{snap.responsavel}</span>
                                      </div>
                                      <strong style={{ fontSize: '12px', display: 'block', color: '#111' }}>{snap.acao}</strong>
                                      <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>{Object.keys(snap.estadoCarrinho).length} itens no carrinho neste momento</span>
                                  </div>
                              ))
                          )}
                      </div>

                      {/* Lado Direito: Preview do Carrinho */}
                      <div style={{ width: '55%', padding: '20px', overflowY: 'auto', backgroundColor: '#fff' }}>
                          {!snapshotSelecionado ? (
                              <div style={{textAlign: 'center', color: '#94a3b8', fontSize: '13px', marginTop: '100px'}}>
                                  👈 Selecione um momento no histórico ao lado para visualizar os itens e devolver.
                              </div>
                          ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                  <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#111' }}>
                                      Itens do carrinho às {new Date(snapshotSelecionado.hora).toLocaleTimeString('pt-BR')}
                                  </h4>
                                  
                                  <div style={{ flex: 1 }}>
                                      {Object.keys(snapshotSelecionado.estadoCarrinho).length === 0 ? (
                                          <div style={{textAlign: 'center', color: '#ef4444', fontSize: '12px', padding: '20px', background: '#fef2f2', borderRadius: '12px'}}>
                                              O carrinho estava VAZIO neste momento.
                                          </div>
                                      ) : (
                                          Object.keys(snapshotSelecionado.estadoCarrinho).map((nome, idx) => {
                                              const itemC = snapshotSelecionado.estadoCarrinho[nome];
                                              return (
                                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                                                      <div>
                                                          <strong style={{fontSize: '12px'}}>{formatarNomeItem(nome)}</strong>
                                                          {itemC.qtd_bonificada > 0 && <span style={{fontSize: '10px', color: '#d97706', display: 'block'}}>🎁 {itemC.qtd_bonificada} Bonif.</span>}
                                                      </div>
                                                      <span style={{background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', border: '1px solid #e2e8f0'}}>
                                                          {itemC.quantidade}
                                                      </span>
                                                  </div>
                                              )
                                          })
                                      )}
                                  </div>

                                  <button onClick={() => confirmarDevolucao(snapshotSelecionado)} style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '13px', boxShadow: '0 4px 15px rgba(239,68,68,0.3)' }}>
                                      🔙 DEVOLVER ESTE CARRINHO PARA O CLIENTE
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>

              </div>
          </div>
      )}

    </div>
  );
}
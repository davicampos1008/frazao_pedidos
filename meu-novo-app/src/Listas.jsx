import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Listas() {
  // 💡 LÓGICA DE DATA FIXA E SELECIONÁVEL
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_listas_data') || obterDataLocal();
  });
  const dataBr = dataFiltro.split('-').reverse().join('/');

  useEffect(() => {
    localStorage.setItem('virtus_listas_data', dataFiltro);
    carregarDados();
  }, [dataFiltro]);

  const [lojas, setLojas] = useState([]);
  const [pedidosDia, setPedidosDia] = useState([]);
  const [produtosBd, setProdutosBd] = useState([]); 
  const [modalAberto, setModalAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // 💡 ESTADOS PARA EDIÇÃO DA LISTA
  const [editandoLista, setEditandoLista] = useState(false);
  const [listaEditada, setListaEditada] = useState({});

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  async function carregarDados() {
    try {
      setCarregando(true);
      const { data: dLojas } = await supabase.from('lojas').select('*').order('nome_fantasia', { ascending: true });
      const { data: dPedidos } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro); 
      const { data: dProdutos } = await supabase.from('produtos').select('id, nome, preco, peso_caixa, unidade_medida'); 
      
      const lojasDb = dLojas || [];
      
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }

      setLojas(lojasDb);
      setPedidosDia(dPedidos || []);
      setProdutosBd(dProdutos || []); 
    } catch (err) { console.error("Erro:", err); } 
    finally { setCarregando(false); }
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
    const corpo = pLoja.map(i => `- ${i.quantidade} ${String(i.unidade || i.unidade_medida).toUpperCase()} : ${formatarNomeItem(String(i.nome || i.nome_produto))}`).join('\n');
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
      for (const idPedido of Object.keys(listaEditada)) {
        promessas.push(
          supabase.from('pedidos')
          .update({ 
              quantidade: Number(listaEditada[idPedido].quantidade),
              nome_produto: listaEditada[idPedido].nome.toUpperCase() 
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
        resumoLog += `[${hora}] ${log.login_responsavel} ${log.acao}: ${log.quantidade}x ${formatarNomeItem(log.item_nome)}\n`;
      });

      navigator.clipboard.writeText(resumoLog);
      alert("✅ Histórico copiado para a área de transferência!");

    } catch (err) {
      alert("Erro ao puxar histórico: " + err.message);
    }
  };

  // 💡 NOVA FUNÇÃO: RESTAURAÇÃO FORÇADA E DIRETA PARA A NUVEM DO CLIENTE
 // 💡 NOVA FUNÇÃO: RESTAURAÇÃO FORÇADA E DIRETA PARA A NUVEM DO CLIENTE
  const forcarRetornoCarrinho = async (lojaAlvo) => {
    if (!lojaAlvo) return;
    if (!window.confirm(`Tem certeza que deseja FORÇAR o retorno da lista para o carrinho da loja ${lojaAlvo.nome_fantasia}?\n\nOs itens aparecerão imediatamente na tela do cliente.`)) return;
    
    setCarregando(true);
    try {
      const lojaAbertaPedidos = pedidosDia.filter(p => extrairNum(p.loja_id) === extrairNum(lojaAlvo.codigo_loja));
      const payloadNuvem = [];

      lojaAbertaPedidos.forEach(dbItem => {
        const prodOriginal = produtosBd.find(p => p.nome === dbItem.nome_produto || p.nome === dbItem.nome);
        
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

          const bonif = Number(dbItem.qtd_bonificada) || 0;
          const qtdCobrada = Math.max(0, Number(dbItem.quantidade) - bonif);

          payloadNuvem.push({
              loja_id: extrairNum(lojaAlvo.codigo_loja),
              produto_id: prodOriginal.id,
              nome: prodOriginal.nome,
              quantidade: dbItem.quantidade,
              qtd_bonificada: bonif,
              valorUnit: precoFinalItem,
              total: precoFinalItem * qtdCobrada,
              unidade_medida: dbItem.unidade_medida || undFinal
          });
        }
      });

      if (payloadNuvem.length > 0) {
          // Limpa o carrinho atual na nuvem caso tenha lixo e insere os resgatados
          await supabase.from('carrinho_nuvem').delete().eq('loja_id', extrairNum(lojaAlvo.codigo_loja));
          const { error: errNuvem } = await supabase.from('carrinho_nuvem').insert(payloadNuvem);
          if (errNuvem) throw errNuvem;
      }

      // Apaga os pedidos finalizados para liberar a loja
      await supabase.from('pedidos')
        .delete()
        .eq('data_pedido', dataFiltro) 
        .eq('loja_id', extrairNum(lojaAlvo.codigo_loja));

      alert("✅ Carrinho forçado com sucesso! A loja já pode ver e editar os itens no aplicativo.");
      fecharModal();
      carregarDados();
    } catch (err) {
      alert("Erro ao forçar retorno: " + err.message);
      setCarregando(false);
    }
  };

  // 💡 NOVA FUNÇÃO: RECONSTRÓI O CARRINHO LENDO OS CLIQUES E IGNORANDO A LIXEIRA
  // 💡 NOVA FUNÇÃO: RECONSTRÓI O CARRINHO LENDO APENAS O ÚLTIMO SAVE ANTES DE ZERAR
  const resgatarRascunhoLog = async (lojaAlvo) => {
    if (!lojaAlvo) return;
    if (!window.confirm(`🚨 SALVA-VIDAS: Isso vai reconstruir o carrinho da loja ${lojaAlvo.nome_fantasia} com os itens exatos que estavam lá logo antes do cliente clicar em "Esvaziar Carrinho" pela última vez. Continuar?`)) return;

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

        if (!logs || logs.length === 0) {
            alert("Nenhum histórico de cliques encontrado para esta loja hoje.");
            setCarregando(false);
            return;
        }

        let carrinhoTemporario = {};
        let ultimoCarrinhoAntesDeZerar = {};

        // Lê a linha do tempo cronologicamente
        logs.forEach(log => {
            if (log.acao === 'ZEROU CARRINHO' || log.acao === 'ENVIOU PEDIDO') {
                // Tira a "foto" (backup) do carrinho antes de apagar, caso ele não esteja vazio
                if (Object.keys(carrinhoTemporario).length > 0) {
                    ultimoCarrinhoAntesDeZerar = { ...carrinhoTemporario };
                }
                carrinhoTemporario = {}; // Esvazia o carrinho atual
            } else if (log.acao === 'REMOVEU') {
                delete carrinhoTemporario[log.item_nome];
            } else {
                carrinhoTemporario[log.item_nome] = log.quantidade;
            }
        });

        // Se ele zerou e se arrependeu, a lista certa está no "ultimoCarrinhoAntesDeZerar"
        // Se ele não zerou hoje (só deu bug e sumiu), a lista certa está no "carrinhoTemporario"
        const itensParaResgatar = Object.keys(ultimoCarrinhoAntesDeZerar).length > 0 
            ? ultimoCarrinhoAntesDeZerar 
            : carrinhoTemporario;

        const payloadNuvem = [];
        Object.keys(itensParaResgatar).forEach(nomeItem => {
            const prodOriginal = produtosBd.find(p => p.nome === nomeItem);
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

                payloadNuvem.push({
                    loja_id: extrairNum(lojaAlvo.codigo_loja),
                    produto_id: prodOriginal.id,
                    nome: prodOriginal.nome,
                    quantidade: itensParaResgatar[nomeItem],
                    qtd_bonificada: 0,
                    valorUnit: precoFinalItem,
                    total: precoFinalItem * itensParaResgatar[nomeItem],
                    unidade_medida: undFinal
                });
            }
        });

        if (payloadNuvem.length === 0) {
            alert("O histórico não possui itens válidos para restaurar. O carrinho antes de zerar estava vazio.");
            setCarregando(false);
            return;
        }

        // Deleta o carrinho atual da nuvem e insere o backup resgatado
        await supabase.from('carrinho_nuvem').delete().eq('loja_id', extrairNum(lojaAlvo.codigo_loja));
        await supabase.from('carrinho_nuvem').insert(payloadNuvem);
        
        // Se a loja tiver um pedido parcialmente enviado ou travado, a gente limpa
        await supabase.from('pedidos').delete().eq('data_pedido', dataFiltro).eq('loja_id', extrairNum(lojaAlvo.codigo_loja));

        alert(`✅ Ufa! Carrinho reconstruído com ${payloadNuvem.length} itens resgatados do último "save". O cliente já pode voltar ao app e finalizar a compra.`);
        carregarDados();
    } catch (err) {
        alert("Erro ao resgatar rascunho: " + err.message);
        setCarregando(false);
    }
  };

  const fecharModal = () => {
    setModalAberto(null);
    setEditandoLista(false);
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando painel...</div>;

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

              {/* BOTÕES SEMPRE VISÍVEIS DO LADO DE FORA */}
              {/* BOTÕES SEMPRE VISÍVEIS DO LADO DE FORA */}
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
                          forcarRetornoCarrinho(loja);
                      }}
                      style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      title="Devolve o pedido que foi finalizado de volta ao carrinho"
                  >
                      📥 DEVOLVER PEDIDO
                  </button>

                  {/* 💡 NOVO BOTÃO DE RESGATE DO HISTÓRICO (IGNORA LIXEIRA) */}
                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          resgatarRascunhoLog(loja);
                      }}
                      style={{ flex: 1, background: '#eab308', color: '#111', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                      title="Resgata os cliques mesmo se o carrinho foi esvaziado"
                  >
                      🛟 RESGATAR RASCUNHO
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
              {lojaAbertaPedidos.map((item, i) => (
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
                      <span style={{fontSize: '14px', fontWeight: 'bold'}}>{formatarNomeItem(String(item.nome || item.nome_produto || ""))}</span>
                      <span style={{background: '#111', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '14px'}}>
                        {item.quantidade} <small style={{fontSize:'10px', color: '#aaa'}}>{item.unidade || item.unidade_medida}</small>
                      </span>
                    </>
                  )}
                </div>
              ))}
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
    </div>
  );
}
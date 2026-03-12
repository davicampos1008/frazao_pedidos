import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function PlanilhaCompras() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_data_filtro') || obterDataLocal();
  });
  const dataBr = dataFiltro.split('-').reverse().join('/');

  const [abaAtiva, setAbaAtiva] = useState('pendentes'); 
  const [carregando, setCarregando] = useState(true);
  
  const [buscaPendentes, setBuscaPendentes] = useState('');
  const [buscaFeitos, setBuscaFeitos] = useState('');
  const [buscaFornecedores, setBuscaFornecedores] = useState('');
  const [buscaFornList, setBuscaFornList] = useState(''); 
  const [buscaSelecionar, setBuscaSelecionar] = useState(''); 

  const [demandas, setDemandas] = useState([]); 
  const [pedidosFeitos, setPedidosFeitos] = useState([]); 
  const [pedidosRaw, setPedidosRaw] = useState([]); 
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [lojasBd, setLojasBd] = useState([]);
  
  const [listaGeralItens, setListaGeralItens] = useState([]);
  const [itemResumoExpandido, setItemResumoExpandido] = useState(null);
  const [modoImpressaoResumo, setModoImpressaoResumo] = useState(false);

  const [itemModal, setItemModal] = useState(null);
  const [abaModal, setAbaModal] = useState('completo'); 
  
  const [dadosCompra, setDadosCompra] = useState({ 
    fornecedor: '', valor_unit: '', qtd_pedir: '', isFaltaGeral: false, qtdFornecedor: '', temBonificacao: false 
  });
  const [lojasEnvolvidas, setLojasEnvolvidas] = useState([]);

  const [fornExpandido, setFornExpandido] = useState(null);
  const [lojaGeralSelecionada, setLojaGeralSelecionada] = useState({});
  const [localCompra, setLocalCompra] = useState(''); 

  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [nomeFornecedorLote, setNomeFornecedorLote] = useState('');
  
  const [agrupamentos, setAgrupamentos] = useState(() => {
    try {
      const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });
  const [precosAgrupados, setPrecosAgrupados] = useState({});
  const [grupoExpandido, setGrupoExpandido] = useState(null);
  
  const [nomesPersonalizados, setNomesPersonalizados] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nomes_personalizados_virtus')) || {}; } catch(e){ return {}; }
  });
  const [modalNomesFornecedor, setModalNomesFornecedor] = useState(null);

  const [mensagensCopiadas, setMensagensCopiadas] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);

  // 💡 NOVOS ESTADOS PARA EDIÇÃO DE NOME DE FORNECEDOR
  const [editandoNomeForn, setEditandoNomeForn] = useState(null);
  const [novoNomeForn, setNovoNomeForn] = useState('');

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('virtus_data_filtro', dataFiltro);
  }, [dataFiltro]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
      setAgrupamentos(salvo ? JSON.parse(salvo) : []);
    } catch(e) { setAgrupamentos([]); }
  }, [dataFiltro]);

  useEffect(() => {
    localStorage.setItem(`agrupamentos_virtus_${dataFiltro}`, JSON.stringify(agrupamentos));
  }, [agrupamentos, dataFiltro]);

  useEffect(() => {
    localStorage.setItem('nomes_personalizados_virtus', JSON.stringify(nomesPersonalizados));
  }, [nomesPersonalizados]);

  const removerAcentos = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const tratarPrecoNum = (p) => parseFloat(String(p || '0').replace('R$', '').trim().replaceAll('.', '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatarNomeItem = (str) => {
    if (!str || typeof str !== 'string' || str.trim() === '') return 'Sem Nome';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  const limparNomeParaWhatsapp = (str) => {
    return str.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase();
  };

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 3000);
  };

  const marcarComoCopiado = (id) => {
    setMensagensCopiadas(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  // 💡 FUNÇÃO PARA CANCELAR UM ÚNICO ITEM DENTRO DO PEDIDO DO FORNECEDOR
  const cancelarItemUnico = async (idPedido, nomeItem) => {
    if (!window.confirm(`Deseja cancelar apenas "${nomeItem}"? Ele voltará para os PENDENTES.`)) return;
    setCarregando(true);
    try {
      await supabase.from('pedidos').update({
        status_compra: 'pendente',
        fornecedor_compra: '',
        custo_unit: '',
        qtd_atendida: 0,
        qtd_bonificada: 0
      }).eq('id', idPedido);
      mostrarNotificacao(`Item ${nomeItem} cancelado com sucesso.`, 'sucesso');
      carregarDados();
    } catch (e) {
      alert("Erro ao cancelar: " + e.message);
      setCarregando(false);
    }
  };

  // 💡 FUNÇÃO PARA ALTERAR O NOME DO FORNECEDOR EM TODOS OS PEDIDOS DO DIA
  const atualizarNomeFornecedorGeral = async () => {
    if (!novoNomeForn.trim()) return;
    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos')
        .update({ fornecedor_compra: novoNomeForn.toUpperCase().trim() })
        .eq('data_pedido', dataFiltro)
        .eq('fornecedor_compra', editandoNomeForn);
      
      if (error) throw error;
      
      mostrarNotificacao(`Fornecedor alterado para ${novoNomeForn.toUpperCase()}`, 'sucesso');
      setEditandoNomeForn(null);
      carregarDados();
    } catch (e) {
      alert("Erro ao editar nome: " + e.message);
      setCarregando(false);
    }
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      const { data: lojasData } = await supabase.from('lojas').select('*');
      
      const lojasDb = lojasData || [];
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }
      setLojasBd(lojasDb);
      
      const { data: prodData } = await supabase.from('produtos').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      
      setPedidosRaw(pedData || []);
      setFornecedoresBd(fornData || []); // Cadastro oficial do banco
      
      const mapaPendentes = {};
      const mapaFeitos = {};
      const mapaGeralItens = {}; 
      const mapaForn = {};

      (pedData || []).forEach(p => {
        if (p.bloqueado === true) return; 

        const idLoja = extrairNum(p.loja_id);
        const nomeProdutoUpper = String(p.nome_produto || "DESCONHECIDO").toUpperCase();
        const qtdPedida = Number(p.quantidade || 0);

        if (idLoja !== null && idLoja >= 0) { 
          const lojaInfo = lojasDb.find(l => extrairNum(l.codigo_loja) === idLoja);
          const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${idLoja}`;

          if (p.status_compra === 'pendente') {
            if (!mapaPendentes[nomeProdutoUpper]) {
              mapaPendentes[nomeProdutoUpper] = { nome: nomeProdutoUpper, demanda: 0, qtd_bonificada_cliente: 0, unidade: String(p.unidade_medida || "UN"), lojas: [] };
            }
            mapaPendentes[nomeProdutoUpper].demanda += qtdPedida;
            mapaPendentes[nomeProdutoUpper].lojas.push({ 
              id_pedido: p.id, loja_id: idLoja, nome_fantasia: nomeLoja, qtd_pedida: qtdPedida, qtd_bonificada_cliente: p.qtd_bonificada || 0 
            });
          } else {
            if (!mapaFeitos[nomeProdutoUpper]) mapaFeitos[nomeProdutoUpper] = { nome: nomeProdutoUpper, total_resolvido: 0, status: p.status_compra, unidade: String(p.unidade_medida || "UN"), itens: [] };
            mapaFeitos[nomeProdutoUpper].total_resolvido += qtdPedida;
            mapaFeitos[nomeProdutoUpper].itens.push(p);
          }

          if (!mapaGeralItens[nomeProdutoUpper]) {
            mapaGeralItens[nomeProdutoUpper] = { nome: nomeProdutoUpper, unidade: String(p.unidade_medida || "UN"), total_solicitado: 0, total_comprado: 0, isFaltaTotal: false, fornecedores_comprados: {} };
          }
          mapaGeralItens[nomeProdutoUpper].total_solicitado += qtdPedida;

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
            mapaGeralItens[nomeProdutoUpper].total_comprado += Number(p.qtd_atendida || 0);
            let fName = String(p.fornecedor_compra || '').replace('ALERTA|', '').trim().toUpperCase();
            if (!mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName]) {
              mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName] = { qtd: 0, isBoleto: p.status_compra === 'boleto' };
            }
            mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName].qtd += Number(p.qtd_atendida || 0);

            if (fName && fName !== 'REFAZER') {
              if (!mapaForn[fName]) {
                const cadastro = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fName || (f.nome_completo || '').toUpperCase() === fName);
                mapaForn[fName] = { nome: fName, totalGeral: 0, lojas: {}, temCadastro: !!cadastro, alertas: [] };
              }
              const valNum = tratarPrecoNum(p.custo_unit);
              const totalItem = (Number(p.qtd_atendida) - (Number(p.qtd_bonificada) || 0)) * valNum;
              if (!mapaForn[fName].lojas[nomeLoja]) {
                mapaForn[fName].lojas[nomeLoja] = { nome: nomeLoja, placa: lojaInfo?.placa_caminhao || 'SEM PLACA', totalLoja: 0, itens: [] };
              }
              mapaForn[fName].lojas[nomeLoja].itens.push({ id_pedido: p.id, nome: nomeProdutoUpper, qtd: p.qtd_atendida, qtd_bonificada: p.qtd_bonificada || 0, unidade: p.unidade_medida || 'UN', valor_unit: p.custo_unit, totalNum: totalItem, isBoleto: p.status_compra === 'boleto' });
              mapaForn[fName].lojas[nomeLoja].totalLoja += totalItem;
              mapaForn[fName].totalGeral += totalItem;
            }
          }
        }
      });

      setListaGeralItens(Object.values(mapaGeralItens).sort((a, b) => a.nome.localeCompare(b.nome)));
      setDemandas(Object.values(mapaPendentes).map(item => {
        const prodRef = (prodData || []).find(p => String(p.nome || '').toUpperCase() === item.nome);
        return { ...item, preco_sugerido: prodRef?.preco || 'R$ 0,00', fornecedor_sugerido: prodRef?.fornecedor_nome || 'Não cadastrado' };
      }).sort((a, b) => a.nome.localeCompare(b.nome)));

      setPedidosFeitos(Object.values(mapaFeitos).sort((a, b) => a.nome.localeCompare(b.nome)));
      setFornecedoresAtivos(Object.values(mapaForn).sort((a, b) => a.nome.localeCompare(b.nome)));

    } catch (err) { console.error("Erro VIRTUS:", err); } 
    finally { if (!silencioso) setCarregando(false); }
  }, [dataFiltro]);

  const [fornecedoresAtivos, setFornecedoresAtivos] = useState([]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const atualizarAoVivo = () => carregarDados(true);

  const resetarPedidosDoDia = async () => {
    if (!window.confirm(`🚨 ATENÇÃO: Deseja realmente recomeçar?`)) return;
    setCarregando(true);
    await supabase.from('pedidos').update({ status_compra: 'pendente', fornecedor_compra: '', custo_unit: '', qtd_atendida: 0 }).eq('data_pedido', dataFiltro);
    setAgrupamentos([]);
    carregarDados();
  };

  const desfazerFeito = async (item) => {
    if (!window.confirm(`Deseja editar o pedido "${item.nome}"?`)) return;
    setCarregando(true);
    const promessas = item.itens.map(p => supabase.from('pedidos').update({ fornecedor_compra: '', custo_unit: '', qtd_atendida: 0, status_compra: 'pendente' }).eq('id', p.id));
    await Promise.all(promessas);
    carregarDados();
  };

  const marcarFaltaDireto = async (item, e) => {
    e.stopPropagation(); 
    setCarregando(true);
    const promessas = item.lojas.map(l => supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido));
    await Promise.all(promessas);
    carregarDados();
  };

  const abrirModalCompra = (item) => {
    setItemModal(item);
    setAbaModal('completo');
    setDadosCompra({ fornecedor: '', valor_unit: '', qtd_pedir: item.demanda, isFaltaGeral: false, qtdFornecedor: '', temBonificacao: false });
    setLojasEnvolvidas(item.lojas.map(l => ({ ...l, qtd_receber: l.qtd_pedida, qtd_bonificada: 0, isFalta: false, isBoleto: false })));
  };

  const atualizarLoja = (id_pedido, campo, valor) => {
    setLojasEnvolvidas(lojasEnvolvidas.map(l => (l.id_pedido === id_pedido ? { ...l, [campo]: valor } : l)));
  };

  const finalizarPedidoCompleto = () => {
    if (!dadosCompra.isFaltaGeral && !dadosCompra.fornecedor) return alert("⚠️ Preencha o fornecedor.");
    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
    setItemModal(null);
    setCarregando(true);
    const promessas = lojasEnvolvidas.map(loja => supabase.from('pedidos').update({
      fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: precoFinal, qtd_atendida: loja.qtd_pedida, status_compra: loja.isBoleto ? 'boleto' : 'atendido'
    }).eq('id', loja.id_pedido));
    Promise.all(promessas).then(() => carregarDados(true));
  };

  const finalizarPedidoFracionado = () => {
    if (!dadosCompra.fornecedor) return alert("⚠️ O fornecedor é obrigatório.");
    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
    setItemModal(null);
    setCarregando(true);
    const promessas = lojasEnvolvidas.map(loja => supabase.from('pedidos').update({
      fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: precoFinal, qtd_atendida: Number(loja.qtd_receber), status_compra: 'atendido'
    }).eq('id', loja.id_pedido));
    Promise.all(promessas).then(() => carregarDados(true));
  };

  const gerarPedidoGeral = (f) => {
    const nomeLoja = lojaGeralSelecionada[f.nome];
    if (!nomeLoja) return alert("⚠️ Selecione a loja titular.");
    let msg = `*${nomeLoja.toUpperCase()}*\n\n`;
    f.lojas[nomeLoja].itens.forEach(i => { msg += `${i.qtd} ${i.nome} - ${i.valor_unit}\n`; });
    navigator.clipboard.writeText(msg);
    marcarComoCopiado(`geral_${f.nome}`);
  };

  const copiarMensagemWhatsapp = (lojaNome, lojaData, btnId, fNome) => {
    let msg = `*${lojaNome.toUpperCase()}*\n\n`;
    lojaData.itens.forEach(i => { msg += `${i.qtd} ${i.nome}\n`; });
    navigator.clipboard.writeText(msg);
    marcarComoCopiado(btnId);
  };

  const finalizarLoteFornecedor = (grupoId, tipoFechamento) => {
    const grupo = agrupamentos.find(g => g.id === grupoId);
    setCarregando(true);
    const promessas = [];
    grupo.itens.forEach(nomeItem => {
      const demandaItem = demandas.find(d => d.nome === nomeItem);
      const precoDigitado = precosAgrupados[`${grupoId}_${nomeItem}`] || '0,00';
      demandaItem.lojas.forEach(loja => {
        promessas.push(supabase.from('pedidos').update({
          fornecedor_compra: grupo.fornecedor, custo_unit: `R$ ${precoDigitado}`, qtd_atendida: loja.qtd_pedida, status_compra: tipoFechamento === 'boleto' ? 'boleto' : 'atendido'
        }).eq('id', loja.id_pedido));
      });
    });
    Promise.all(promessas).then(() => { setAgrupamentos(prev => prev.filter(g => g.id !== grupoId)); carregarDados(true); });
  };

  const alternarSelecaoLote = (nomeItem) => {
    setItensSelecionados(prev => prev.includes(nomeItem) ? prev.filter(i => i !== nomeItem) : [...prev, nomeItem]);
  };

  const criarGrupoFornecedor = () => {
    const novoGrupo = { id: Date.now(), fornecedor: nomeFornecedorLote.toUpperCase().trim(), itens: itensSelecionados, status: 'pendente' };
    setAgrupamentos(prev => [...prev, novoGrupo]);
    setItensSelecionados([]);
    setNomeFornecedorLote('');
    setAbaAtiva('pedidos_fornecedor');
  };

  let itensJaAgrupados = agrupamentos.reduce((acc, g) => acc.concat(g.itens), []);

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', paddingBottom: '120px' }}>
      
      {/* DATALIST CONECTADO AO BANCO */}
      <datalist id="lista-fornecedores">
        {fornecedoresBd.map(f => <option key={f.id} value={f.nome_fantasia || f.nome_completo} />)}
      </datalist>

      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>🛒 MESA DE COMPRAS</h2>
        <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} style={{ background: '#333', color: '#fff', padding: '8px', border: 'none', marginTop: '10px' }} />
        <button onClick={atualizarAoVivo} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px', marginLeft: '10px', borderRadius: '8px' }}>🔄 ATUALIZAR STATUS</button>
        <button onClick={resetarPedidosDoDia} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px', marginLeft: '10px', borderRadius: '8px' }}>🚨 ZERAR TUDO</button>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto' }}>
        <button onClick={() => setAbaAtiva('pendentes')} style={{ padding: '15px', border: 'none', borderRadius: '12px', background: abaAtiva === 'pendentes' ? '#f97316' : '#fff' }}>📋 PENDENTES</button>
        <button onClick={() => setAbaAtiva('selecionar_forn')} style={{ padding: '15px', border: 'none', borderRadius: '12px', background: abaAtiva === 'selecionar_forn' ? '#8b5cf6' : '#fff' }}>🛒 SELECIONAR</button>
        <button onClick={() => setAbaAtiva('pedidos_fornecedor')} style={{ padding: '15px', border: 'none', borderRadius: '12px', background: abaAtiva === 'pedidos_fornecedor' ? '#14b8a6' : '#fff' }}>📦 AGRUPADOS</button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ padding: '15px', border: 'none', borderRadius: '12px', background: abaAtiva === 'fornecedores' ? '#111' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#000' }}>📇 FORNECEDORES</button>
      </div>

      {abaAtiva === 'pendentes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
          {demandas.map(item => (
            <div key={item.nome} onClick={() => abrirModalCompra(item)} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', textAlign: 'center', cursor: 'pointer', borderTop: '4px solid #f97316' }}>
              <strong style={{ fontSize: '13px' }}>{item.nome}</strong>
              <div style={{ fontSize: '20px', fontWeight: '900' }}>{item.demanda}</div>
            </div>
          ))}
        </div>
      )}

      {abaAtiva === 'selecionar_forn' && (
        <div>
          {demandas.filter(d => !itensJaAgrupados.includes(d.nome)).map(item => (
            <div key={item.nome} onClick={() => alternarSelecaoLote(item.nome)} style={{ background: '#fff', padding: '15px', marginBottom: '5px', borderLeft: itensSelecionados.includes(item.nome) ? '5px solid #8b5cf6' : '1px solid #ddd', cursor: 'pointer' }}>
               <input type="checkbox" checked={itensSelecionados.includes(item.nome)} readOnly /> {item.nome} ({item.demanda})
            </div>
          ))}
          {itensSelecionados.length > 0 && (
            <div style={{ position: 'fixed', bottom: 0, width: '100%', background: '#fff', padding: '20px', left: 0, boxShadow: '0 -5px 10px rgba(0,0,0,0.1)' }}>
               {/* 💡 DATALIST APLICADO NO AGRUPAMENTO */}
               <input list="lista-fornecedores" placeholder="Fornecedor..." value={nomeFornecedorLote} onChange={e => setNomeFornecedorLote(e.target.value)} style={{ padding: '15px', width: '70%', borderRadius: '8px' }} />
               <button onClick={criarGrupoFornecedor} style={{ background: '#8b5cf6', color: '#fff', padding: '15px', borderRadius: '8px', border: 'none', marginLeft: '10px' }}>AGRUPAR</button>
            </div>
          )}
        </div>
      )}

      {abaAtiva === 'fornecedores' && (
        <div>
          {fornecedoresAtivos.map(f => (
            <div key={f.nome} style={{ background: '#fff', borderRadius: '15px', padding: '20px', marginBottom: '10px', borderTop: f.temCadastro ? '6px solid #111' : '6px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {editandoNomeForn === f.nome ? (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <input list="lista-fornecedores" value={novoNomeForn} onChange={e => setNovoNomeForn(e.target.value)} style={{ padding: '5px', border: '1px solid #ccc' }} />
                      <button onClick={atualizarNomeFornecedorGeral} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px' }}>Salvar</button>
                      <button onClick={() => setEditandoNomeForn(null)} style={{ background: '#ccc', border: 'none', borderRadius: '4px' }}>✕</button>
                    </div>
                  ) : (
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      🏢 {f.nome} 
                      {/* 💡 BOTÃO DE EDIÇÃO DE NOME */}
                      <button onClick={() => {setEditandoNomeForn(f.nome); setNovoNomeForn(f.nome);}} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>⚙️</button>
                      {/* 💡 ALERTA DE SEM CADASTRO */}
                      {!f.temCadastro && <span style={{ background: '#ef4444', color: '#fff', fontSize: '9px', padding: '3px 6px', borderRadius: '4px' }}>⚠️ SEM CADASTRO</span>}
                    </h3>
                  )}
                </div>
                <strong style={{ fontSize: '18px', color: '#16a34a' }}>{formatarMoeda(f.totalGeral)}</strong>
              </div>
              
              <div onClick={() => setFornExpandido(fornExpandido === f.nome ? null : f.nome)} style={{ cursor: 'pointer', marginTop: '10px', color: '#666' }}>Ver lojas envolvidas ▼</div>

              {fornExpandido === f.nome && (
                <div style={{ marginTop: '15px' }}>
                  {Object.values(f.lojas).map(loja => (
                    <div key={loja.nome} style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '5px' }}>
                      <strong>{loja.nome}:</strong>
                      {loja.itens.map(it => (
                        <div key={it.id_pedido} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
                          <span>{it.qtd}x {it.nome} - {it.valor_unit}</span>
                          {/* 💡 CANCELAMENTO SELETIVO DE ITEM */}
                          <button onClick={() => cancelarItemUnico(it.id_pedido, it.nome)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>✖</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {itemModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#fff', width: '90%', maxWidth: '500px', padding: '30px', borderRadius: '20px' }}>
            <h3>Lançar: {itemModal.nome}</h3>
            {/* 💡 DATALIST APLICADO NO MODAL INDIVIDUAL */}
            <input list="lista-fornecedores" placeholder="Fornecedor..." value={dadosCompra.fornecedor} onChange={(e) => setDadosCompra({...dadosCompra, fornecedor: e.target.value})} style={{ width: '100%', padding: '15px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
            <input type="text" placeholder="Valor Unitário (R$)" value={dadosCompra.valor_unit} onChange={(e) => setDadosCompra({...dadosCompra, valor_unit: e.target.value})} style={{ width: '100%', padding: '15px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ddd' }} />
            <button onClick={abaModal === 'completo' ? finalizarPedidoCompleto : finalizarPedidoFracionado} style={{ width: '100%', padding: '15px', background: '#111', color: '#fff', borderRadius: '8px', border: 'none', fontWeight: 'bold' }}>FINALIZAR PEDIDO</button>
            <button onClick={() => setItemModal(null)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#666' }}>Cancelar</button>
          </div>
        </div>
      )}

    </div>
  );
}
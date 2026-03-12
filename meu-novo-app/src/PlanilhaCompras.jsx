import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function PlanilhaCompras() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  // 💡 NOVO: Controle de Data persistente no cache (não reseta ao atualizar a página)
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

  const [copiadoGeral, setCopiadoGeral] = useState(null);
  const [copiadoLoja, setCopiadoLoja] = useState(null);

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

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // 💡 NOVO: Salva a data sempre que ela for alterada
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
  const formatarValorSemSimbolo = (v) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      
      const mapaPendentes = {};
      const mapaFeitos = {};
      const mapaGeralItens = {}; 
      const mapaForn = {};

      (pedData || []).forEach(p => {
        // 💡 IGNORAR SE ESTIVER BLOQUEADO
        if (p.bloqueado === true) return; 

        const idLoja = extrairNum(p.loja_id);
        const nomeProdutoUpper = String(p.nome_produto || "DESCONHECIDO").toUpperCase();
        const qtdPedida = Number(p.quantidade || 0);
        const qtdBonificada = Number(p.qtd_bonificada || 0);

        if (idLoja !== null && idLoja >= 0) { 
          const lojaInfo = lojasDb.find(l => extrairNum(l.codigo_loja) === idLoja);
          const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${idLoja}`;

          let isAlertaFornecedor = false;
          let nomeFornOriginal = String(p.fornecedor_compra || '').toUpperCase();
          
          if (nomeFornOriginal.startsWith('ALERTA|')) {
             isAlertaFornecedor = true;
             nomeFornOriginal = nomeFornOriginal.replace('ALERTA|', '');
          }

          if (p.status_compra === 'pendente') {
            if (!mapaPendentes[nomeProdutoUpper]) {
              mapaPendentes[nomeProdutoUpper] = { nome: nomeProdutoUpper, demanda: 0, qtd_bonificada_cliente: 0, unidade: String(p.unidade_medida || "UN"), lojas: [] };
            }
            mapaPendentes[nomeProdutoUpper].demanda += qtdPedida;
            mapaPendentes[nomeProdutoUpper].qtd_bonificada_cliente += qtdBonificada;
            mapaPendentes[nomeProdutoUpper].lojas.push({ 
              id_pedido: p.id, loja_id: idLoja, nome_fantasia: nomeLoja, qtd_pedida: qtdPedida, qtd_bonificada_cliente: qtdBonificada 
            });
            
            if (isAlertaFornecedor && nomeFornOriginal && nomeFornOriginal !== 'REFAZER') {
               if (!mapaForn[nomeFornOriginal]) {
                   mapaForn[nomeFornOriginal] = { nome: nomeFornOriginal, chavePix: '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalDescontoBonif: 0, qtdBonificadaGeral: 0, totalGeral: 0, lojas: {}, alertas: [] };
               }
               if (!mapaForn[nomeFornOriginal].alertas.includes(nomeProdutoUpper)) {
                   mapaForn[nomeFornOriginal].alertas.push(nomeProdutoUpper);
               }
            }
          } else {
            if (!mapaFeitos[nomeProdutoUpper]) mapaFeitos[nomeProdutoUpper] = { nome: nomeProdutoUpper, total_resolvido: 0, status: p.status_compra, unidade: String(p.unidade_medida || "UN"), itens: [] };
            mapaFeitos[nomeProdutoUpper].total_resolvido += qtdPedida;
            mapaFeitos[nomeProdutoUpper].itens.push(p);
          }

          if (!mapaGeralItens[nomeProdutoUpper]) {
             mapaGeralItens[nomeProdutoUpper] = {
                nome: nomeProdutoUpper, unidade: String(p.unidade_medida || "UN"), total_solicitado: 0, total_comprado: 0, isFaltaTotal: false, temBoleto: false, fornecedores_comprados: {}
             };
          }
          mapaGeralItens[nomeProdutoUpper].total_solicitado += qtdPedida;

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             mapaGeralItens[nomeProdutoUpper].total_comprado += Number(p.qtd_atendida || 0);
             let fNameRaw = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'DESCONHECIDO';
             let fName = fNameRaw.replace('ALERTA|', '').trim();
             
             const fornInfoParaPJ = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fName);
             let displayFornName = fName;
             if (fornInfoParaPJ && String(fornInfoParaPJ.tipo_chave_pix || '').toUpperCase() === 'CNPJ') {
                 displayFornName = `${fName} (PJ)`;
             }

             if (p.status_compra === 'boleto') displayFornName += ' (B)';
             
             if (!mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName]) {
                 mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName] = { qtd: 0, isBoleto: p.status_compra === 'boleto' };
             }
             mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName].qtd += Number(p.qtd_atendida || 0);
             if (p.status_compra === 'boleto') mapaGeralItens[nomeProdutoUpper].temBoleto = true;
          }
          
          if (p.status_compra === 'falta') {
             mapaGeralItens[nomeProdutoUpper].total_solicitado -= qtdPedida; 
          }

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             let fNomeRaw = String(p.fornecedor_compra || '').toUpperCase();
             let fNome = fNomeRaw.replace('ALERTA|', '').trim();

             if (fNome && fNome !== 'REFAZER') {
                 if (!mapaForn[fNome]) {
                     const fInfo = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fNome);
                     mapaForn[fNome] = {
                         nome: fNome, chavePix: fInfo ? fInfo.chave_pix : '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalDescontoBonif: 0, qtdBonificadaGeral: 0, totalGeral: 0, lojas: {}, alertas: []
                     };
                 }

                 const isBoleto = p.status_compra === 'boleto';
                 let baseVal = String(p.custo_unit || 'R$ 0,00');
                 let qtdBonifFornecedor = 0;
                 
                 if (baseVal.includes('BONIFICAÇÃO |')) {
                     baseVal = baseVal.split('|')[1] ? baseVal.split('|')[1].trim() : 'R$ 0,00';
                 }
                 
                 qtdBonifFornecedor = Number(p.qtd_bonificada) || 0;

                 const valNum = tratarPrecoNum(baseVal);
                 const baseValFormatado = valNum > 0 ? formatarMoeda(valNum) : baseVal; 
                 
                 const qtdCobradaForn = Math.max(0, p.qtd_atendida - qtdBonifFornecedor);
                 const totalItemFornCobrado = qtdCobradaForn * valNum;
                 const valorEconomizadoBonif = qtdBonifFornecedor * valNum;

                 const placaBase = lojaInfo && lojaInfo.placa_caminhao ? String(lojaInfo.placa_caminhao).toUpperCase().trim() : 'SEM PLACA';
                 
                 if (!mapaForn[fNome].lojas[nomeLoja]) {
                     mapaForn[fNome].lojas[nomeLoja] = { nome: nomeLoja, placa: placaBase, totalLoja: 0, itens: [] };
                 }

                 const idxItemForn = mapaForn[fNome].lojas[nomeLoja].itens.findIndex(i => 
                    i.nome === nomeProdutoUpper && i.isBoleto === isBoleto && tratarPrecoNum(i.valor_unit) === valNum
                 );

                 if (idxItemForn >= 0) {
                     mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].qtd += p.qtd_atendida;
                     mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].qtd_bonificada += qtdBonifFornecedor;
                     mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].totalNum += totalItemFornCobrado;
                 } else {
                     mapaForn[fNome].lojas[nomeLoja].itens.push({
                         id_pedido: p.id, nome: nomeProdutoUpper, qtd: p.qtd_atendida, qtd_bonificada: qtdBonifFornecedor, unidade: String(p.unidade_medida || 'UN'), valor_unit: baseValFormatado, totalNum: totalItemFornCobrado, isBoleto: isBoleto
                     });
                 }

                 mapaForn[fNome].lojas[nomeLoja].totalLoja += totalItemFornCobrado;
                 mapaForn[fNome].totalBruto += (totalItemFornCobrado + valorEconomizadoBonif);
                 mapaForn[fNome].totalDescontoBonif += valorEconomizadoBonif;
                 mapaForn[fNome].qtdBonificadaGeral += qtdBonifFornecedor;
                 mapaForn[fNome].totalGeral += totalItemFornCobrado;

                 if (isBoleto) {
                     mapaForn[fNome].totalBoleto += totalItemFornCobrado;
                 } else {
                     mapaForn[fNome].totalPix += totalItemFornCobrado;
                 }
             }
          }
        }
      });

      Object.values(mapaGeralItens).forEach(item => {
         if (item.total_solicitado <= 0 && item.total_comprado <= 0) {
             item.isFaltaTotal = true;
         }
      });
      setListaGeralItens(Object.values(mapaGeralItens).sort((a, b) => a.nome.localeCompare(b.nome)));

      const arrayPendentes = Object.values(mapaPendentes).map(item => {
        const prodRef = (prodData || []).find(p => String(p.nome || '').toUpperCase() === item.nome);
        const isResto = !!mapaFeitos[item.nome];
        return { 
          ...item, 
          preco_sugerido: prodRef ? prodRef.preco : 'R$ 0,00',
          fornecedor_sugerido: prodRef && prodRef.fornecedor_nome ? prodRef.fornecedor_nome : 'Não cadastrado',
          isResto
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome));

      setDemandas(arrayPendentes);
      setPedidosFeitos(Object.values(mapaFeitos).sort((a, b) => a.nome.localeCompare(b.nome)));
      
      const fornProcessados = Object.values(mapaForn).map(f => {
         f.precisaRefazer = f.alertas && f.alertas.length > 0;
         return f;
      }).sort((a, b) => a.nome.localeCompare(b.nome));
      setFornecedoresBd(fornProcessados);

    } catch (err) { console.error("Erro VIRTUS:", err); } 
    finally { if (!silencioso) setCarregando(false); }
  }, [dataFiltro]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // 💡 FUNÇÃO DO NOVO BOTÃO DE ATUALIZAR STATUS AO VIVO
  const atualizarAoVivo = () => {
    carregarDados(true); // true = silencioso (não mostra a tela de carregamento)
    mostrarNotificacao('🔄 Lista atualizada com os dados mais recentes!', 'sucesso');
  };

  const resetarPedidosDoDia = async () => {
    if (!window.confirm(`🚨 ATENÇÃO: Isso vai ZERAR todos os pedidos, boletos e faltas da data ${dataBr}.\n\nTudo voltará para a aba de PENDENTES.\n\nDeseja realmente recomeçar?`)) return;
    setCarregando(true);
    try {
      await supabase.from('pedidos').update({ status_compra: 'pendente', fornecedor_compra: '', custo_unit: '', qtd_atendida: 0 }).eq('data_pedido', dataFiltro);
      setAgrupamentos([]);
      localStorage.removeItem(`agrupamentos_virtus_${dataFiltro}`);
      setAbaAtiva('pendentes');
      carregarDados();
    } catch (err) { alert("Erro ao resetar: " + err.message); setCarregando(false); }
  };

  const desfazerFeito = async (item) => {
    if (!window.confirm(`Deseja editar o pedido "${item.nome}" e devolvê-lo para a lista de PENDENTES?`)) return;
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
    setLojasEnvolvidas(lojasEnvolvidas.map(l => {
      if (l.id_pedido === id_pedido) {
        const novaLoja = { ...l, [campo]: valor };
        if (campo === 'isFalta' && valor === true) novaLoja.qtd_receber = 0;
        if (campo === 'qtd_bonificada') {
           const maximo = Number(novaLoja.qtd_receber) || Number(novaLoja.qtd_pedida);
           if (Number(valor) > maximo) {
               alert(`Você não pode bonificar (${valor}) mais do que a loja está recebendo (${maximo}).`);
               novaLoja.qtd_bonificada = maximo;
           }
        }
        return novaLoja;
      }
      return l;
    }));
  };

  const aceitarBonificacaoCliente = () => {
     setDadosCompra({...dadosCompra, temBonificacao: true});
     setLojasEnvolvidas(lojasEnvolvidas.map(l => ({
        ...l,
        qtd_bonificada: l.qtd_bonificada_cliente || 0
     })));
     mostrarNotificacao('✅ Bonificações preenchidas conforme pedido das lojas.', 'sucesso');
  };

  const finalizarPedidoCompleto = () => {
    if (!dadosCompra.isFaltaGeral && !dadosCompra.fornecedor) return alert("⚠️ Preencha o fornecedor.");

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
    const isAlgumBoleto = lojasEnvolvidas.some(l => l.isBoleto);
    const statusGeral = isAlgumBoleto ? 'boleto' : 'atendido';
    const qtdDesejada = Number(dadosCompra.qtd_pedir) || 0;

    setItemModal(null);
    setCarregando(true);

    const promessas = [];
    const pedidosParaClonar = [];
    let qtdRestanteParaDistribuir = qtdDesejada;

    if (dadosCompra.isFaltaGeral) {
      lojasEnvolvidas.forEach(l => promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido)));
    } else {
      lojasEnvolvidas.forEach(loja => {
        const bonificada = Number(loja.qtd_bonificada) || 0;

        if (qtdRestanteParaDistribuir >= loja.qtd_pedida) {
          promessas.push(supabase.from('pedidos').update({
            fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: precoFinal, qtd_atendida: loja.qtd_pedida, qtd_bonificada: bonificada, status_compra: statusGeral
          }).eq('id', loja.id_pedido));
          qtdRestanteParaDistribuir -= loja.qtd_pedida;
        } else if (qtdRestanteParaDistribuir > 0) {
          promessas.push(supabase.from('pedidos').update({
            fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: precoFinal, qtd_atendida: qtdRestanteParaDistribuir, qtd_bonificada: bonificada, quantidade: qtdRestanteParaDistribuir, status_compra: statusGeral
          }).eq('id', loja.id_pedido));

          const resto = loja.qtd_pedida - qtdRestanteParaDistribuir;
          const rowOriginal = pedidosRaw.find(p => p.id === loja.id_pedido);
          if (rowOriginal) {
            const { id, created_at, ...dadosLimpos } = rowOriginal;
            pedidosParaClonar.push({ ...dadosLimpos, quantidade: resto, qtd_atendida: 0, status_compra: 'pendente', fornecedor_compra: '', custo_unit: '' });
          }
          qtdRestanteParaDistribuir = 0;
        } 
      });
    }

    Promise.all(promessas).then(async () => {
      if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
      mostrarNotificacao("✅ Pedido fechado com sucesso!", "sucesso");
      carregarDados(true);
      setCarregando(false);
    });
  };

  const finalizarPedidoFracionado = () => {
    const temCompra = lojasEnvolvidas.some(l => (Number(l.qtd_receber) > 0));
    if (temCompra && !dadosCompra.fornecedor) return alert("⚠️ O fornecedor é obrigatório.");

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';

    setItemModal(null);
    setCarregando(true);

    const promessas = [];
    const pedidosParaClonar = [];

    lojasEnvolvidas.forEach(loja => {
      const receber = Number(loja.qtd_receber) || 0;
      const bonificada = Number(loja.qtd_bonificada) || 0;
      
      if (receber > 0) {
        promessas.push(supabase.from('pedidos').update({
          fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: precoFinal, qtd_atendida: receber, qtd_bonificada: bonificada, quantidade: receber, status_compra: loja.isBoleto ? 'boleto' : 'atendido'
        }).eq('id', loja.id_pedido));

        if (receber < loja.qtd_pedida) {
          const resto = loja.qtd_pedida - receber;
          const rowOriginal = pedidosRaw.find(p => p.id === loja.id_pedido);
          if (rowOriginal) {
            const { id, created_at, ...dadosLimpos } = rowOriginal;
            pedidosParaClonar.push({ ...dadosLimpos, quantidade: resto, qtd_atendida: 0, status_compra: loja.isFalta ? 'falta' : 'pendente', custo_unit: loja.isFalta ? 'FALTA' : '', fornecedor_compra: '' });
          }
        }
      } else if (loja.isFalta) {
        promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', loja.id_pedido));
      }
    });

    Promise.all(promessas).then(async () => {
      if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
      mostrarNotificacao("✅ Pedido fracionado salvo!", "sucesso");
      carregarDados(true);
      setCarregando(false);
    });
  };

  const limparAlertaFornecedor = async (nomeForn) => {
     setCarregando(true);
     await supabase.from('pedidos').update({ fornecedor_compra: '' }).eq('data_pedido', dataFiltro).eq('status_compra', 'pendente').like('fornecedor_compra', `ALERTA|${nomeForn}`);
     carregarDados();
  };

  const getNomeExibicaoWhatsApp = (fornecedorNome, itemName, itemUnidade) => {
     if (nomesPersonalizados[fornecedorNome] && nomesPersonalizados[fornecedorNome][itemName]) {
         const obj = nomesPersonalizados[fornecedorNome][itemName];
         return obj.usarUnidade ? `${obj.nome} - ${String(itemUnidade).toUpperCase()}` : obj.nome;
     }
     return limparNomeParaWhatsapp(formatarNomeItem(itemName));
  };

  const gerarPedidoGeral = (f) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA no topo da tela antes de copiar os pedidos!");
    
    const nomeLoja = lojaGeralSelecionada[f.nome];
    if (!nomeLoja) return alert("⚠️ Selecione a loja titular da banca para o cabeçalho (O NOME DELA IRÁ NO TOPO).");

    const lojaData = f.lojas[nomeLoja];
    const placaBase = lojaData.placa.split('|')[0].trim() || 'SEM PLACA';
    const comp = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
    
    const mapaItensGerais = {};

    Object.values(f.lojas).forEach(loja => {
      loja.itens.forEach(item => {
        const key = `${item.nome}`;
        if (!mapaItensGerais[key]) {
          mapaItensGerais[key] = { ...item, qtd: 0, qtd_bonificada: 0 };
        }
        mapaItensGerais[key].qtd += item.qtd;
        mapaItensGerais[key].qtd_bonificada += item.qtd_bonificada || 0;
      });
    });

    let msg = `*${nomeLoja.replace(/^\d+\s*-\s*/, '').trim().toUpperCase()}*\n\n`;
    
    Object.values(mapaItensGerais).forEach(i => {
       const nomeWhats = getNomeExibicaoWhatsApp(f.nome, i.nome, i.unidade);
       const precoNum = tratarPrecoNum(i.valor_unit);
       const totalLinha = (i.qtd - (i.qtd_bonificada || 0)) * precoNum;

       msg += `${i.qtd} ${nomeWhats} - ${i.valor_unit} (Total: ${formatarMoeda(totalLinha)})`;
       if (i.qtd_bonificada > 0) msg += ` (🎁 +${i.qtd_bonificada})`;
       msg += `\n`;
    });

    msg += `\n${placaBase} - ${comp} - TOTAL: ${formatarMoeda(f.totalGeral)}`;

    navigator.clipboard.writeText(msg);
    marcarComoCopiado(`geral_${f.nome}`);
    mostrarNotificacao('✅ Pedido Geral copiado para o WhatsApp!', 'sucesso');
  };

  const copiarMensagemWhatsapp = (lojaNome, lojaData, btnId, fNome) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA no topo da tela antes de copiar os pedidos!");

    const nomeFormatado = lojaNome.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();
    const placaBase = lojaData.placa.split('|')[0].trim() || 'SEM PLACA';
    const comp = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';

    let msg = `*${nomeFormatado}*\n\n`;
    lojaData.itens.forEach(i => { 
        const nomeWhats = getNomeExibicaoWhatsApp(fNome, i.nome, i.unidade);
        msg += `${i.qtd} ${nomeWhats}`;
        if (i.qtd_bonificada > 0) msg += ` (🎁 +${i.qtd_bonificada})`;
        msg += `\n`;
    });
    msg += `\n${placaBase} - ${comp}`;
    
    navigator.clipboard.writeText(msg);
    marcarComoCopiado(btnId);
    mostrarNotificacao('✅ Lista copiada para o WhatsApp!', 'sucesso');
  };

  const finalizarLoteFornecedor = (grupoId, tipoFechamento) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA no topo da tela antes de enviar o pedido.");
    
    const grupo = agrupamentos.find(g => g.id === grupoId);
    if (!grupo) return;

    setCarregando(true);
    const promessas = [];
    
    if (tipoFechamento === 'sem_preco') {
        grupo.itens.forEach(nomeItem => {
            const demandaItem = demandas.find(d => d.nome === nomeItem);
            if (!demandaItem) return;
            demandaItem.lojas.forEach(loja => {
                promessas.push(supabase.from('pedidos').update({
                    fornecedor_compra: grupo.fornecedor,
                    custo_unit: 'R$ 0,00',
                    qtd_atendida: loja.qtd_pedida,
                    qtd_bonificada: loja.qtd_bonificada_cliente || 0,
                    status_compra: 'atendido'
                }).eq('id', loja.id_pedido));
            });
        });
        
        Promise.all(promessas).then(() => {
            setAgrupamentos(prev => prev.map(g => g.id === grupoId ? {...g, status: 'enviado_sem_preco'} : g));
            mostrarNotificacao(`📦 Pedido para ${grupo.fornecedor} enviado (Aguardando Preços).`, 'sucesso');
            carregarDados(true);
            setCarregando(false);
        });

    } else {
        let isBoleto = tipoFechamento === 'boleto';
        let tudoPreenchido = true;

        grupo.itens.forEach(nomeItem => {
            const demandaItem = demandas.find(d => d.nome === nomeItem);
            const precoDigitado = precosAgrupados[`${grupoId}_${nomeItem}`];
            if (!precoDigitado || precoDigitado === '0') tudoPreenchido = false;

            let precoLimpo = precoDigitado ? precoDigitado.replace(/[^\d,.-]/g, '').trim() : '';
            if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
            const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';

            if (demandaItem) {
               demandaItem.lojas.forEach(loja => {
                   promessas.push(supabase.from('pedidos').update({
                       fornecedor_compra: grupo.fornecedor,
                       custo_unit: precoFinal,
                       qtd_atendida: loja.qtd_pedida, 
                       qtd_bonificada: loja.qtd_bonificada_cliente || 0,
                       status_compra: isBoleto ? 'boleto' : 'atendido'
                   }).eq('id', loja.id_pedido));
               });
            }
        });
        
        if (!tudoPreenchido && !window.confirm("Alguns itens estão sem preço. Deseja finalizar mesmo assim?")) {
           setCarregando(false);
           return;
        }

        Promise.all(promessas).then(() => {
            setAgrupamentos(prev => prev.filter(g => g.id !== grupoId));
            mostrarNotificacao(`✅ Preços de ${grupo.fornecedor} lançados!`, 'sucesso');
            carregarDados(true);
            setCarregando(false);
        });
    }
  };

  const voltarGrupoParaEdicao = async (grupoId) => {
      setCarregando(true);
      const grupo = agrupamentos.find(g => g.id === grupoId);
      if (!grupo) return;
      const promessas = [];
      grupo.itens.forEach(nomeItem => {
          const demandaItem = demandas.find(d => d.nome === nomeItem);
          if (demandaItem) {
              demandaItem.lojas.forEach(loja => {
                  promessas.push(supabase.from('pedidos').update({ status_compra: 'pendente', custo_unit: '' }).eq('id', loja.id_pedido));
              });
          }
      });
      await Promise.all(promessas);
      setAgrupamentos(prev => prev.map(g => g.id === grupoId ? {...g, status: 'pendente'} : g));
      carregarDados(true);
      mostrarNotificacao('🔄 O grupo voltou para a edição de preços.', 'info');
      setCarregando(false);
  };

  const processarPDFResumo = async (modo = 'baixar') => {
     const elemento = document.getElementById('area-impressao-resumo');
     if (!elemento) return;
     const nomeArquivo = `Resumo_Compras_${dataBr.replace(/\//g, '-')}.pdf`;
     const opt = { margin: [10, 10, 15, 10], filename: nomeArquivo, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };

     if (!window.html2pdf) return alert("Aguarde, carregando biblioteca PDF...");
     if (modo === 'whatsapp') {
       try {
         const pdfBlob = await window.html2pdf().set(opt).from(elemento).output('blob');
         const file = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
         if (navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({ files: [file], title: nomeArquivo, text: 'Resumo de Compras' });
         } else {
           alert("Seu dispositivo não suporta compartilhamento direto. O arquivo será baixado.");
           window.html2pdf().set(opt).from(elemento).save();
         }
       } catch (e) { console.error("Erro no Share API", e); }
     } else if (modo === 'preview') {
       const pdfBlobUrl = await window.html2pdf().set(opt).from(elemento).output('bloburl');
       window.open(pdfBlobUrl, '_blank');
     } else { window.html2pdf().set(opt).from(elemento).save(); }
  };

  const renderListaLojasModal = () => (
    <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#111', display: 'block', marginBottom: '15px', textTransform: 'uppercase' }}>
        Distribuição nas lojas ({(abaModal === 'completo' ? 'Pedido Completo' : 'Pedido Fracionado')}):
      </span>
      {lojasEnvolvidas.map(loja => (
        <div key={loja.id_pedido} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ flex: '1 1 auto', minWidth: '100px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block' }}>{loja.nome_fantasia}</span>
            <span style={{ fontSize: '10px', color: '#f97316', fontWeight: 'bold' }}>Pediu: {loja.qtd_pedida}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            {abaModal === 'fracionado' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label style={{ fontSize: '9px', color: '#666', fontWeight: 'bold' }}>Receber</label>
                <input type="number" value={loja.qtd_receber} onChange={(e) => atualizarLoja(loja.id_pedido, 'qtd_receber', e.target.value)} style={{ width: '50px', padding: '8px', borderRadius: '8px', border: '2px solid #ccc', textAlign: 'center', fontWeight: 'bold' }} />
              </div>
            )}
            {dadosCompra.temBonificacao && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#dcfce7', padding: '5px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <label style={{ fontSize: '9px', color: '#166534', fontWeight: 'bold' }}>🎁 Bonif.</label>
                <input type="number" value={loja.qtd_bonificada} onChange={(e) => atualizarLoja(loja.id_pedido, 'qtd_bonificada', e.target.value)} placeholder="0" style={{ width: '50px', padding: '6px', borderRadius: '6px', border: '1px solid #16a34a', textAlign: 'center', fontWeight: 'bold', color: '#16a34a' }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '10px', fontWeight: '900', color: '#d97706', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="checkbox" checked={loja.isBoleto} onChange={(e) => atualizarLoja(loja.id_pedido, 'isBoleto', e.target.checked)} /> BOLETO
              </label>
              <label style={{ fontSize: '10px', fontWeight: '900', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="checkbox" checked={loja.isFalta} onChange={(e) => atualizarLoja(loja.id_pedido, 'isFalta', e.target.checked)} /> FALTA
              </label>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const alternarSelecaoLote = (nomeItem) => {
    setItensSelecionados(prev => 
      prev.includes(nomeItem) ? prev.filter(i => i !== nomeItem) : [...prev, nomeItem]
    );
  };

  const criarGrupoFornecedor = () => {
    if (!nomeFornecedorLote.trim()) return alert("Digite o nome do fornecedor para agrupar.");
    if (itensSelecionados.length === 0) return alert("Selecione pelo menos um item.");
    
    const novoGrupo = {
      id: Date.now(),
      fornecedor: nomeFornecedorLote.toUpperCase().trim(),
      itens: itensSelecionados,
      status: 'pendente'
    };
    
    setAgrupamentos(prev => [...prev, novoGrupo]);
    setItensSelecionados([]);
    setNomeFornecedorLote('');
    mostrarNotificacao(`Itens separados para ${novoGrupo.fornecedor}`, 'sucesso');
    setAbaAtiva('pedidos_fornecedor');
    setGrupoExpandido(novoGrupo.id);
  };

  const removerGrupoFornecedor = (idGrupo) => {
    if(window.confirm("Deseja desfazer este grupo? Os itens voltarão a ficar disponíveis para seleção.")) {
       setAgrupamentos(prev => prev.filter(g => g.id !== idGrupo));
    }
  };

  if (carregando && demandas.length === 0 && pedidosFeitos.length === 0) {
    return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando...</div>;
  }

  let itensJaAgrupados = [];
  try {
      itensJaAgrupados = agrupamentos.reduce((acc, g) => acc.concat(Array.isArray(g.itens) ? g.itens : []), []);
  } catch (e) {
      itensJaAgrupados = [];
  }

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px', padding: '10px' }}>
      
      <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', width: '90%', maxWidth: '400px' }}>
        {notificacoes.map(notif => (
          <div key={notif.id} style={{ background: notif.tipo === 'alerta' ? '#ef4444' : (notif.tipo === 'info' ? '#3b82f6' : '#22c55e'), color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '13px' }}>
            <span>{notif.mensagem}</span>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>🛒 MESA DE COMPRAS</h2>
            
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            
            {/* 💡 NOVO BOTÃO DE ATUALIZAÇÃO MANUAL/AO VIVO */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={atualizarAoVivo} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}>
                🔄 ATUALIZAR STATUS
              </button>
              <button onClick={resetarPedidosDoDia} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(239,68,68,0.4)' }}>
                🚨 ZERAR TUDO
              </button>
            </div>

            <div style={{ display: 'flex', backgroundColor: '#333', borderRadius: '10px', padding: '4px' }}>
              <button onClick={() => setLocalCompra('ceasa')} style={{ border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: localCompra === 'ceasa' ? '#f97316' : 'transparent', color: localCompra === 'ceasa' ? '#fff' : '#999' }}>CEASA</button>
              <button onClick={() => setLocalCompra('ceilandia')} style={{ border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: localCompra === 'ceilandia' ? '#f97316' : 'transparent', color: localCompra === 'ceilandia' ? '#fff' : '#999' }}>CEILÂNDIA</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button onClick={() => setAbaAtiva('pendentes')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pendentes' ? '#f97316' : '#fff', color: abaAtiva === 'pendentes' ? '#fff' : '#64748b' }}>
          📋 PENDENTES ({demandas.length})
        </button>
        <button onClick={() => setAbaAtiva('selecionar_forn')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'selecionar_forn' ? '#8b5cf6' : '#fff', color: abaAtiva === 'selecionar_forn' ? '#fff' : '#64748b' }}>
          🛒 SELECIONAR FORN.
        </button>
        <button onClick={() => setAbaAtiva('pedidos_fornecedor')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pedidos_fornecedor' ? '#14b8a6' : '#fff', color: abaAtiva === 'pedidos_fornecedor' ? '#fff' : '#64748b', position: 'relative' }}>
          📦 PEDIDOS AGRUPADOS {agrupamentos.length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', borderRadius: '50%', padding: '2px 6px', fontSize: '10px' }}>{agrupamentos.length}</span>}
        </button>
        <button onClick={() => setAbaAtiva('feitos')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'feitos' ? '#3b82f6' : '#fff', color: abaAtiva === 'feitos' ? '#fff' : '#64748b' }}>
          ✅ FEITOS ({pedidosFeitos.length})
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#111' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#64748b' }}>
          📇 FORNECEDORES ({fornecedoresBd.length})
        </button>
        <button onClick={() => setAbaAtiva('lista_fornecedores')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'lista_fornecedores' ? '#ec4899' : '#fff', color: abaAtiva === 'lista_fornecedores' ? '#fff' : '#64748b' }}>
          📦 RESUMO ITENS
        </button>
      </div>

      <datalist id="lista-fornecedores">
        {fornecedoresBd.map(f => <option key={f.id} value={f.nome} />)}
      </datalist>

      {abaAtiva === 'pendentes' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar pendência..." value={buscaPendentes} onChange={e => setBuscaPendentes(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {demandas.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#22c55e', backgroundColor: '#fff', borderRadius: '16px', fontWeight: 'bold' }}>🎉 Zero pendências!</div>
            ) : (
              demandas.filter(d => removerAcentos(d.nome).includes(removerAcentos(buscaPendentes))).map(item => (
                <div key={item.nome} onClick={() => abrirModalCompra(item)} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer', borderTop: item.isResto ? '4px solid #ef4444' : '4px solid #f97316', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '5px', right: '5px' }}>
                    <button onClick={(e) => marcarFaltaDireto(item, e)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '4px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>🚫</button>
                  </div>
                  <div style={{ backgroundColor: item.isResto ? '#fef2f2' : '#fef3c7', color: item.isResto ? '#ef4444' : '#b45309', padding: '10px', borderRadius: '50%', fontWeight: '900', fontSize: '20px', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    {item.demanda}
                  </div>
                  <strong style={{ fontSize: '13px', color: '#111', lineHeight: '1.2' }}>{item.nome}</strong>
                  <span style={{ fontSize: '10px', color: item.isResto ? '#ef4444' : '#64748b', fontWeight: item.isResto ? 'bold' : 'normal', marginTop: '5px' }}>
                    {item.isResto ? 'RESTA COMPRAR' : `${item.lojas.length} Loja(s)`}
                  </span>
                  {item.qtd_bonificada_cliente > 0 && (
                     <span style={{ fontSize: '10px', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '6px', fontWeight: 'bold', marginTop: '5px' }}>
                       🎁 {item.qtd_bonificada_cliente} Bonif. Solicitada
                     </span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {abaAtiva === 'selecionar_forn' && (
        <div style={{ paddingBottom: '80px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Filtrar para selecionar..." value={buscaSelecionar} onChange={e => setBuscaSelecionar(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {demandas.filter(d => removerAcentos(d.nome).includes(removerAcentos(buscaSelecionar)) && !itensJaAgrupados.includes(d.nome)).map(item => {
              const isSelecionado = itensSelecionados.includes(item.nome);
              
              return (
              <div key={item.nome} onClick={() => alternarSelecaoLote(item.nome)} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: isSelecionado ? '5px solid #8b5cf6' : '5px solid #e2e8f0', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                 <input type="checkbox" checked={isSelecionado} readOnly style={{ width: '20px', height: '20px', accentColor: '#8b5cf6', pointerEvents: 'none' }} />
                 <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#111' }}>{item.nome}</strong>
                    <small style={{ color: '#666', fontSize: '11px' }}>{item.demanda} {item.unidade} • {item.lojas.length} Loja(s)</small>
                 </div>
              </div>
            )})}
            {demandas.length > 0 && demandas.every(d => itensJaAgrupados.includes(d.nome)) && (
               <div style={{ textAlign: 'center', padding: '40px', color: '#22c55e', backgroundColor: '#fff', borderRadius: '16px', fontWeight: 'bold' }}>Todos os itens já foram agrupados! Vá para a aba "Pedidos Agrupados".</div>
            )}
          </div>

          {itensSelecionados.length > 0 && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', backgroundColor: '#fff', padding: '20px', boxShadow: '0 -10px 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1000, boxSizing: 'border-box' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#8b5cf6' }}>{itensSelecionados.length} Itens Selecionados</strong>
                  <button onClick={() => setItensSelecionados([])} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold' }}>Limpar</button>
               </div>
               <div style={{ display: 'flex', gap: '10px' }}>
                  <input list="lista-fornecedores" placeholder="Nome do Fornecedor..." value={nomeFornecedorLote} onChange={e => setNomeFornecedorLote(e.target.value)} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '2px solid #e2e8f0', outline: 'none', textTransform: 'uppercase', fontWeight: 'bold' }} />
                  <button onClick={criarGrupoFornecedor} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>AGRUPAR</button>
               </div>
            </div>
          )}
        </div>
      )}

      {abaAtiva === 'pedidos_fornecedor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {agrupamentos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum fornecedor agrupado. Vá na aba "Selecionar Forn." para criar.</div>
          ) : (
            agrupamentos.map((grupo) => {
              const expandido = grupoExpandido === grupo.id;
              
              const lojasDoGrupo = {};
              grupo.itens.forEach(nomeItem => {
                 const dItem = demandas.find(d => d.nome === nomeItem);
                 if(dItem) {
                    dItem.lojas.forEach(l => {
                       if(!lojasDoGrupo[l.nome_fantasia]) lojasDoGrupo[l.nome_fantasia] = { id: l.loja_id, itens: [] };
                       lojasDoGrupo[l.nome_fantasia].itens.push({ nome: nomeItem, qtd: l.qtd_pedida, unidade: dItem.unidade });
                    });
                 }
              });

              const isEnviadoSemPreco = grupo.status === 'enviado_sem_preco';

              return (
              <div key={grupo.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: isEnviadoSemPreco ? '5px solid #f97316' : '5px solid #14b8a6' }}>
                 
                 <div onClick={() => setGrupoExpandido(expandido ? null : grupo.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, color: isEnviadoSemPreco ? '#f97316' : '#111', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      🏢 {grupo.fornecedor} 
                      <span style={{background: '#f1f5f9', color: '#64748b', fontSize: '11px', padding: '3px 8px', borderRadius: '8px'}}>{grupo.itens.length} itens</span>
                    </h3>
                    <span style={{ color: '#ccc', transform: expandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                 </div>

                 {expandido && (
                   <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <button onClick={() => removerGrupoFornecedor(grupo.id)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>❌ Desfazer Grupo</button>
                        {isEnviadoSemPreco && (
                           <button onClick={() => voltarGrupoParaEdicao(grupo.id)} style={{ background: '#fff7ed', color: '#d97706', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                             🔄 ADICIONAR PREÇOS FINAIS
                           </button>
                        )}
                     </div>

                     <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#64748b' }}>💰 LANÇAR PREÇOS E FINALIZAR:</h4>
                        {grupo.itens.map(nomeItem => {
                           const demandaReal = demandas.find(d => d.nome === nomeItem);
                           if (!demandaReal) return null;
                           const temBonificacao = demandaReal.qtd_bonificada_cliente > 0;

                           return (
                             <div key={nomeItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', backgroundColor: temBonificacao ? '#fefce8' : 'transparent', padding: temBonificacao ? '10px' : '0', borderRadius: '8px' }}>
                                <div style={{ flex: 1 }}>
                                   <strong style={{ display: 'block', fontSize: '13px', color: '#111' }}>{nomeItem}</strong>
                                   <small style={{ color: '#f97316', fontWeight: 'bold', fontSize: '10px' }}>Pediram: {demandaReal.demanda} {demandaReal.unidade}</small>
                                   {temBonificacao && (
                                     <div style={{ marginTop: '5px' }}>
                                        <span style={{display: 'block', fontSize: '10px', color: '#d97706', fontWeight: 'bold'}}>⚠️ O cliente pediu {demandaReal.qtd_bonificada_cliente} item(ns) bonificado(s).</span>
                                        <button onClick={() => {
                                            mostrarNotificacao(`✅ Bonificação de ${nomeItem} aceita.`, 'sucesso');
                                        }} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', marginTop: '5px', cursor: 'pointer' }}>
                                            ACEITAR BONIFICAÇÃO
                                        </button>
                                     </div>
                                   )}
                                </div>
                                <div style={{ position: 'relative', width: '120px' }}>
                                   <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}>R$</span>
                                   <input 
                                     type="text" 
                                     placeholder="0,00"
                                     value={precosAgrupados[`${grupo.id}_${nomeItem}`] || ''}
                                     onChange={(e) => setPrecosAgrupados({...precosAgrupados, [`${grupo.id}_${nomeItem}`]: e.target.value})}
                                     style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold' }}
                                   />
                                </div>
                             </div>
                           );
                        })}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                          {!isEnviadoSemPreco && (
                            <button onClick={() => finalizarLoteFornecedor(grupo.id, 'sem_preco')} style={{ width: '100%', padding: '15px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>ENVIAR SEM PREÇO (SÓ WHATSAPP)</button>
                          )}
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => finalizarLoteFornecedor(grupo.id, 'avista')} style={{ flex: 1, padding: '15px', background: '#111', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>FECHAR À VISTA</button>
                            <button onClick={() => finalizarLoteFornecedor(grupo.id, 'boleto')} style={{ flex: 1, padding: '15px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>FECHAR NO BOLETO</button>
                          </div>
                        </div>
                     </div>
                   </div>
                 )}
              </div>
            );
            })
          )}
        </div>
      )}

      {abaAtiva === 'feitos' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar concluídos..." value={buscaFeitos} onChange={e => setBuscaFeitos(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {pedidosFeitos.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '16px' }}>Nada concluído ainda.</div>
            ) : (
              pedidosFeitos.filter(d => removerAcentos(d.nome).includes(removerAcentos(buscaFeitos))).map(item => (
                <div key={item.nome} onClick={() => desfazerFeito(item)} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderTop: '4px solid #3b82f6', opacity: 0.8, cursor: 'pointer' }}>
                  <div style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '10px', borderRadius: '50%', fontWeight: '900', fontSize: '18px', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    {item.total_resolvido}
                  </div>
                  <strong style={{ fontSize: '13px', color: '#111', lineHeight: '1.2' }}>{item.nome}</strong>
                  <span style={{ fontSize: '9px', color: '#666', marginTop: '5px' }}>{item.itens.length} NOTA(S)</span>
                  <span style={{ fontSize: '9px', color: '#3b82f6', marginTop: '8px', fontWeight: 'bold' }}>Toque para editar</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {abaAtiva === 'fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Buscar fornecedor..." value={buscaFornecedores} onChange={e => setBuscaFornecedores(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          {fornecedoresBd.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum fornecedor acionado.</div>
          ) : (
            fornecedoresBd.filter(f => removerAcentos(f.nome).includes(removerAcentos(buscaFornecedores))).map((f, idx) => {
              const expandido = fornExpandido === f.nome;
              const temAlerta = f.precisaRefazer;
              
              let estiloBorda = '6px solid #111';
              let iconeTopo = '';
              let corH3 = '#111';

              const todasLojasCopiadas = Object.values(f.lojas).every(loja => mensagensCopiadas.includes(`loja_${f.nome}_${loja.nome}`));

              if (temAlerta) {
                  estiloBorda = '6px solid #ef4444';
                  iconeTopo = '⚠️ ALERTA';
                  corH3 = '#ef4444';
              } else if (todasLojasCopiadas) {
                  estiloBorda = '6px solid #22c55e';
                  iconeTopo = '✅ ENVIADO';
                  corH3 = '#16a34a';
              }

              return (
                <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '20px', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', borderTop: estiloBorda, transition: '0.3s' }}>
                  
                  <div onClick={() => setFornExpandido(expandido ? null : f.nome)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: corH3, textTransform: 'uppercase', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        🏢 {f.nome} 
                        {iconeTopo && <span style={{fontSize: '10px', background: temAlerta ? '#fef2f2' : '#dcfce7', padding: '4px 8px', borderRadius: '6px', color: temAlerta ? '#ef4444' : '#166534'}}>{iconeTopo}</span>}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <strong style={{ color: '#22c55e', fontSize: '18px' }}>{formatarMoeda(f.totalGeral)}</strong>
                      <span style={{ color: '#ccc', transform: expandido ? 'rotate(90deg)' : 'none', transition: '0.2s' }}>❯</span>
                    </div>
                  </div>

                  {expandido && (
                    <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                      
                      {temAlerta && (
                         <div style={{ backgroundColor: '#fef2f2', border: '1px dashed #ef4444', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                            <strong style={{ color: '#ef4444', fontSize: '12px', display: 'block', marginBottom: '5px' }}>🚨 ATENÇÃO: PEDIDO MODIFICADO NO FECHAMENTO!</strong>
                            <p style={{ fontSize: '11px', color: '#991b1b', margin: '0 0 10px 0' }}>
                               Os itens a seguir foram desfeitos, marcados como falta ou tiveram preço alterado nas lojas. Eles <b>voltaram para a aba de PENDENTES</b> e o total deste fornecedor já foi reduzido:
                               <br/><br/><b>{f.alertas.join(', ')}</b>
                            </p>
                            <button onClick={() => limparAlertaFornecedor(f.nome)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
                               ✅ CIENTE (Omitir Alerta)
                            </button>
                         </div>
                      )}

                      <button onClick={() => setModalNomesFornecedor(f)} style={{ width: '100%', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', marginBottom: '20px' }}>
                        ⚙️ Nomes Personalizados para o WhatsApp
                      </button>

                      <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#111' }}>🛍️ PEDIDO GERAL DA BANCA</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <select 
                             value={lojaGeralSelecionada[f.nome] || ''} 
                             onChange={e => setLojaGeralSelecionada({...lojaGeralSelecionada, [f.nome]: e.target.value})}
                             style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', fontWeight: 'bold', color: '#334155' }}
                          >
                             <option value="" disabled>Escolha a Loja Titular (Cabeçalho)...</option>
                             {Object.keys(f.lojas).map(nomeL => <option key={nomeL} value={nomeL}>{nomeL}</option>)}
                          </select>

                          <button 
                              onClick={() => gerarPedidoGeral(f)} 
                              style={{ flex: 1, background: mensagensCopiadas.includes(`geral_${f.nome}`) ? '#22c55e' : '#111', color: '#fff', border: 'none', padding: '15px', borderRadius: '10px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', transition: '0.2s' }}
                          >
                              {mensagensCopiadas.includes(`geral_${f.nome}`) ? '✅ GERAL COPIADO!' : '📋 COPIAR PEDIDO GERAL'}
                          </button>
                        </div>
                      </div>
                      
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#111', paddingLeft: '5px' }}>📦 PEDIDOS SEPARADOS POR LOJA</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.values(f.lojas).map((loja, lIdx) => {
                           const nomeFormatado = loja.nome.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();
                           const btnId = `loja_${f.nome}_${loja.nome}`;
                           
                           return (
                            <div key={lIdx} style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                              <strong style={{ fontSize: '14px', color: '#111', display: 'block', marginBottom: '10px' }}>{nomeFormatado}</strong>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                                {loja.itens.map((item, idxx) => (
                                  <div key={idxx} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                      <span>{item.qtd} <b>{getNomeExibicaoWhatsApp(f.nome, item.nome, item.unidade)}</b></span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      {item.qtd_bonificada > 0 && (
                                        <span style={{ fontSize: '9px', background: '#dcfce7', color: '#166534', padding: '2px 5px', borderRadius: '4px', fontWeight: 'bold' }}>🎁 +{item.qtd_bonificada}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button 
                                onClick={() => copiarMensagemWhatsapp(loja.nome, loja, btnId, f.nome)} 
                                style={{ width: '100%', background: mensagensCopiadas.includes(btnId) ? '#dcfce7' : '#25d366', color: mensagensCopiadas.includes(btnId) ? '#166534' : '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', transition: '0.2s' }}
                              >
                                {mensagensCopiadas.includes(btnId) ? '✅ COPIADO PARA O WHATSAPP' : '🟢 COPIAR LISTA DA LOJA'}
                              </button>
                            </div>
                           );
                        })}
                      </div>

                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {modalNomesFornecedor && (
         <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 11000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '400px', borderRadius: '20px', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#111' }}>Personalizar Nomes</h3>
                  <button onClick={() => setModalNomesFornecedor(null)} style={{ background: '#eee', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
               </div>
               <p style={{ fontSize: '11px', color: '#666', marginBottom: '20px' }}>O nome digitado aqui será usado apenas nas cópias para o WhatsApp para o fornecedor <b>{modalNomesFornecedor.nome}</b>.</p>
               
               {Array.from(new Set(Object.values(modalNomesFornecedor.lojas).flatMap(l => l.itens.map(i => i.nome)))).map(nomeOriginal => {
                   const configsAtuais = nomesPersonalizados[modalNomesFornecedor.nome] || {};
                   const configDesteItem = configsAtuais[nomeOriginal] || { nome: formatarNomeItem(nomeOriginal), usarUnidade: false };

                   return (
                     <div key={nomeOriginal} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>{nomeOriginal}</span>
                        <input 
                           type="text" 
                           value={configDesteItem.nome}
                           onChange={(e) => {
                              setNomesPersonalizados(prev => ({
                                 ...prev,
                                 [modalNomesFornecedor.nome]: {
                                     ...(prev[modalNomesFornecedor.nome] || {}),
                                     [nomeOriginal]: { ...configDesteItem, nome: e.target.value.toUpperCase() }
                                 }
                              }));
                           }}
                           style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: '8px', fontWeight: 'bold' }}
                        />
                        <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                           <input 
                             type="checkbox" 
                             checked={configDesteItem.usarUnidade} 
                             onChange={(e) => {
                                setNomesPersonalizados(prev => ({
                                   ...prev,
                                   [modalNomesFornecedor.nome]: {
                                       ...(prev[modalNomesFornecedor.nome] || {}),
                                       [nomeOriginal]: { ...configDesteItem, usarUnidade: e.target.checked }
                                   }
                                }));
                             }} 
                           />
                           Incluir Unidade de Medida (Ex: CX, KG) na mensagem?
                        </label>
                     </div>
                   );
               })}
               <button onClick={() => setModalNomesFornecedor(null)} style={{ width: '100%', background: '#111', color: '#fff', padding: '15px', borderRadius: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>SALVAR</button>
            </div>
         </div>
      )}

      {abaAtiva === 'lista_fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0', flex: 1 }}>
                <span>🔍</span><input placeholder="Buscar produto..." value={buscaFornList} onChange={e => setBuscaFornList(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
              </div>
              <button onClick={() => setModoImpressaoResumo(true)} style={{ background: '#111', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                📥 GERAR PDF
              </button>
          </div>

          <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
             <span style={{ color: '#16a34a' }}>🟢 Comprado 100%</span>
             <span style={{ color: '#ef4444' }}>🔴 Falta Comprar (Pendente)</span>
             <span style={{ color: '#d97706' }}>🟡 Comprado Parcial</span>
             <span style={{ color: '#64748b', textDecoration: 'line-through' }}>⚫ Falta Assumida</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {listaGeralItens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum pedido hoje.</div>
            ) : (
              listaGeralItens.filter(f => removerAcentos(f.nome).includes(removerAcentos(buscaFornList))).map((item, idx) => {
                
                let corFundo = '#fff';
                let corBorda = '#e2e8f0';
                let corTexto = '#111';
                let statusMsg = '';
                let textoRiscado = 'none';

                if (item.isFaltaTotal) {
                   corFundo = '#f1f5f9';
                   corBorda = '#cbd5e1';
                   corTexto = '#64748b';
                   textoRiscado = 'line-through';
                   statusMsg = 'FALTA ASSUMIDA';
                } else if (item.total_comprado === 0) {
                   corFundo = '#fef2f2';
                   corBorda = '#fecaca';
                   corTexto = '#ef4444';
                   statusMsg = 'PENDENTE 100%';
                } else if (item.total_comprado < item.total_solicitado) {
                   corFundo = '#fffbeb';
                   corBorda = '#fde68a';
                   corTexto = '#d97706';
                   statusMsg = `FALTA COMPRAR: ${item.total_solicitado - item.total_comprado}`;
                } else if (item.total_comprado >= item.total_solicitado) {
                   corFundo = '#dcfce7';
                   corBorda = '#bbf7d0';
                   corTexto = '#166534';
                   statusMsg = 'COMPLETO';
                }

                const cardExpandido = itemResumoExpandido === item.nome;

                return (
                  <div key={idx} onClick={() => setItemResumoExpandido(cardExpandido ? null : item.nome)} style={{ backgroundColor: corFundo, borderRadius: '12px', padding: '15px', border: `1px solid ${corBorda}`, cursor: 'pointer', transition: '0.2s' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: corTexto, textDecoration: textoRiscado, display: 'block' }}>{formatarNomeItem(item.nome)}</strong>
                        <span style={{ fontSize: '11px', color: corTexto, fontWeight: 'bold', display: 'block', marginTop: '2px', opacity: 0.8 }}>Total Pedido Lojas: {item.total_solicitado} {item.unidade}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                         <div style={{ fontSize: '10px', fontWeight: '900', color: corTexto, padding: '4px 8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', display: 'inline-block' }}>
                             {statusMsg}
                         </div>
                      </div>
                    </div>

                    {cardExpandido && Object.keys(item.fornecedores_comprados || {}).length > 0 && (
                      <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: `1px dashed ${corBorda}` }}>
                         <span style={{ fontSize: '10px', fontWeight: 'bold', color: corTexto, opacity: 0.8, display: 'block', marginBottom: '8px' }}>COMPRADO COM:</span>
                         {Object.entries(item.fornecedores_comprados).map(([fornNome, data]) => (
                             <div key={fornNome} style={{ fontSize: '12px', color: corTexto, fontWeight: 'bold', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                 <span>🏢 {fornNome} {data.isBoleto && '(B)'}</span>
                                 <span>{data.qtd}x</span>
                             </div>
                         ))}
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {modoImpressaoResumo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
             <h2 style={{margin:0, fontSize: '18px'}}>Resumo para PDF</h2>
             <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => processarPDFResumo('whatsapp')} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Share WhatsApp</button>
                <button onClick={() => processarPDFResumo('baixar')} style={{ background: '#111', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Baixar PDF</button>
                <button onClick={() => setModoImpressaoResumo(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Fechar</button>
             </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#525659' }}>
             <div id="area-impressao-resumo" style={{ background: '#fff', padding: '30px', width: '210mm', minHeight: '297mm', margin: '0 auto', color: '#000', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                   <h1 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase' }}>RESUMO DE COMPRAS DO DIA</h1>
                   <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>Data: {dataBr} - Gerado pelo VIRTUS</p>
                </div>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                      <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000' }}>
                        <th style={{ padding: '8px', textAlign: 'left', width: '40%' }}>PRODUTO</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>PEDIDO</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>COMPRADO</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>FALTA</th>
                      </tr>
                  </thead>
                  <tbody>
                      {listaGeralItens.map((item, idx) => {
                        const faltaNum = item.total_solicitado - item.total_comprado;
                        const statusFalta = item.isFaltaTotal ? 'F. ASSUMIDA' : (faltaNum > 0 ? faltaNum : 'OK');
                        const isPendencia = !item.isFaltaTotal && faltaNum > 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', color: item.isFaltaTotal ? '#94a3b8' : '#000', fontWeight: isPendencia ? 'bold' : 'normal' }}>
                             <td style={{ padding: '8px', textDecoration: item.isFaltaTotal ? 'line-through' : 'none' }}>{item.nome}</td>
                             <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_solicitado} {item.unidade}</td>
                             <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_comprado} {item.unidade}</td>
                             <td style={{ padding: '8px', textAlign: 'center', color: isPendencia ? '#ef4444' : 'inherit' }}>{statusFalta}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {itemModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '0' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '600px', borderRadius: '30px 30px 0 0', padding: '30px 25px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#111' }}>{itemModal.demanda}x {itemModal.nome}</h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                  Preço Base: <span style={{color:'#f97316'}}>{itemModal.preco_sugerido}</span> | Fornecedor: <span style={{color:'#f97316'}}>{itemModal.fornecedor_sugerido}</span>
                </p>
              </div>
              <button onClick={() => setItemModal(null)} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            {itemModal.qtd_bonificada_cliente > 0 && !dadosCompra.temBonificacao && (
               <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '15px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                    <strong style={{ color: '#d97706', fontSize: '12px', display: 'block' }}>⚠️ O cliente informou bonificação!</strong>
                    <span style={{ fontSize: '11px', color: '#b45309' }}>Total de itens bonificados: <b>{itemModal.qtd_bonificada_cliente}</b></span>
                 </div>
                 <button onClick={aceitarBonificacaoCliente} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                   ACEITAR BONIFICAÇÃO
                 </button>
               </div>
            )}

            <div style={{ display: 'flex', gap: '10px', backgroundColor: '#f1f5f9', padding: '5px', borderRadius: '12px', marginBottom: '20px' }}>
              <button onClick={() => setAbaModal('completo')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaModal === 'completo' ? '#fff' : 'transparent', color: abaModal === 'completo' ? '#111' : '#64748b' }}>
                📦 PEDIDO COMPLETO
              </button>
              <button onClick={() => setAbaModal('fracionado')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaModal === 'fracionado' ? '#fff' : 'transparent', color: abaModal === 'fracionado' ? '#111' : '#64748b' }}>
                🧩 PEDIDO FRACIONADO
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: abaModal === 'fracionado' ? '2fr 1fr' : '1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>FORNECEDOR</label>
                <input list="lista-fornecedores" placeholder="Ex: Zé das Frutas..." value={dadosCompra.fornecedor} onChange={(e) => setDadosCompra({...dadosCompra, fornecedor: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', backgroundColor: dadosCompra.isFaltaGeral ? '#f1f5f9' : '#f8fafc' }} />
              </div>
              
              {abaModal === 'completo' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>QTD. A COMPRAR DELE</label>
                    <input type="number" value={dadosCompra.qtd_pedir} onChange={(e) => setDadosCompra({...dadosCompra, qtd_pedir: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontWeight: '900', textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>VALOR UNITÁRIO (R$)</label>
                    <input type="text" placeholder="0,00" value={dadosCompra.valor_unit} onChange={(e) => setDadosCompra({...dadosCompra, valor_unit: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontWeight: '900' }} />
                  </div>
                </div>
              )}

              {abaModal === 'fracionado' && (
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>VALOR UNIT. (R$)</label>
                  <input type="text" placeholder="0,00" value={dadosCompra.valor_unit} onChange={(e) => setDadosCompra({...dadosCompra, valor_unit: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontWeight: '900' }} />
                </div>
              )}
            </div>

            {abaModal === 'fracionado' && (
              <div style={{ backgroundColor: '#fff7ed', padding: '15px', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '15px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#b45309', display: 'block', marginBottom: '5px' }}>QTD. QUE O FORNECEDOR TEM (Referência):</label>
                <input type="number" value={dadosCompra.qtdFornecedor} onChange={(e) => setDadosCompra({...dadosCompra, qtdFornecedor: e.target.value})} placeholder="Ex: 50" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #fcd34d', fontWeight: 'bold', fontSize: '16px' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1, backgroundColor: dadosCompra.temBonificacao ? '#dcfce7' : '#f8fafc', padding: '15px', borderRadius: '12px', border: dadosCompra.temBonificacao ? '1px solid #86efac' : '1px solid #e2e8f0', transition: '0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: dadosCompra.temBonificacao ? '#166534' : '#64748b', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dadosCompra.temBonificacao} disabled={dadosCompra.isFaltaGeral} onChange={(e) => setDadosCompra({...dadosCompra, temBonificacao: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  🎁 INCLUIR BONIFICAÇÃO
                </label>
              </div>
              {abaModal === 'completo' && (
                <>
                  <div style={{ flex: 1, backgroundColor: '#fffbeb', padding: '15px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#d97706', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={lojasEnvolvidas.some(l => l.isBoleto)} disabled={dadosCompra.isFaltaGeral} onChange={(e) => {
                        setLojasEnvolvidas(lojasEnvolvidas.map(l => ({ ...l, isBoleto: e.target.checked })));
                      }} style={{ width: '20px', height: '20px' }} />
                      📄 BOLETO
                    </label>
                  </div>
                  <div style={{ flex: 1, backgroundColor: '#fef2f2', padding: '15px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={dadosCompra.isFaltaGeral} onChange={(e) => {
                        setDadosCompra({...dadosCompra, isFaltaGeral: e.target.checked, temBonificacao: false});
                        if (e.target.checked) setLojasEnvolvidas(lojasEnvolvidas.map(l => ({...l, qtd_bonificada: 0})));
                      }} style={{ width: '20px', height: '20px' }} />
                      🚫 FALTA
                    </label>
                  </div>
                </>
              )}
            </div>

            {(abaModal === 'fracionado' || (abaModal === 'completo' && dadosCompra.temBonificacao)) && !dadosCompra.isFaltaGeral && (
                renderListaLojasModal()
            )}

            <button onClick={abaModal === 'completo' ? finalizarPedidoCompleto : finalizarPedidoFracionado} style={{ width: '100%', padding: '20px', backgroundColor: dadosCompra.isFaltaGeral ? '#ef4444' : '#111', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}>
              FINALIZAR ITEM {abaModal === 'fracionado' ? 'FRACIONADO' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function PlanilhaCompras() {
  const [abaAtiva, setAbaAtiva] = useState('pendentes'); 
  const [carregando, setCarregando] = useState(true);
  
  const [buscaPendentes, setBuscaPendentes] = useState('');
  const [buscaFeitos, setBuscaFeitos] = useState('');
  const [buscaFornecedores, setBuscaFornecedores] = useState('');
  const [buscaResumo, setBuscaResumo] = useState(''); 

  const [demandas, setDemandas] = useState([]); 
  const [pedidosFeitos, setPedidosFeitos] = useState([]); 
  const [pedidosRaw, setPedidosRaw] = useState([]); 
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [lojasBd, setLojasBd] = useState([]);
  
  const [listaGeralItens, setListaGeralItens] = useState([]);
  const [itemResumoExpandido, setItemResumoExpandido] = useState(null);

  const [itemModal, setItemModal] = useState(null);
  const [abaModal, setAbaModal] = useState('completo'); 
  
  const [dadosCompra, setDadosCompra] = useState({ 
    fornecedor: '', valor_unit: '', qtd_pedir: '', isFaltaGeral: false, qtdFornecedor: '', temBonificacao: false 
  });
  const [lojasEnvolvidas, setLojasEnvolvidas] = useState([]);

  const [fornExpandido, setFornExpandido] = useState(null);
  const [lojaGeralSelecionada, setLojaGeralSelecionada] = useState({});
  const [localCompra, setLocalCompra] = useState('ceasa'); 

  const [copiadoGeral, setCopiadoGeral] = useState(null);
  const [copiadoLoja, setCopiadoLoja] = useState(null);

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

  const extrairNum = (valor) => {
    const num = String(valor || "").match(/\d+/);
    return num ? parseInt(num[0], 10) : null;
  };

  const tratarPrecoNum = (p) => parseFloat(String(p || '0').replace('R$ ', '').replaceAll('.', '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  async function carregarDados() {
    setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      if (fornData) setFornecedoresBd(fornData);

      const { data: lojasData } = await supabase.from('lojas').select('*');
      if (lojasData) setLojasBd(lojasData);
      
      const { data: prodData } = await supabase.from('produtos').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje);
      
      setPedidosRaw(pedData || []);
      
      const mapaPendentes = {};
      const mapaFeitos = {};
      const mapaGeralItens = {}; 
      const mapaForn = {};

      (pedData || []).forEach(p => {
        const idLoja = extrairNum(p.loja_id);
        const nomeProdutoUpper = String(p.nome_produto || "Sem Nome").toUpperCase();

        if (idLoja && idLoja > 1) { 
          const lojaInfo = (lojasData || []).find(l => extrairNum(l.codigo_loja) === idLoja);
          const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${idLoja}`;

          // --- 💡 IDENTIFICA SE O ITEM VOLTOU COMO ALERTA DO FECHAMENTO ---
          let isAlertaFornecedor = false;
          let nomeFornOriginal = String(p.fornecedor_compra || '').toUpperCase();
          
          if (nomeFornOriginal.startsWith('ALERTA|')) {
             isAlertaFornecedor = true;
             nomeFornOriginal = nomeFornOriginal.replace('ALERTA|', '');
          }

          // 1. PENDENTES E FEITOS
          if (p.status_compra === 'pendente') {
            if (!mapaPendentes[nomeProdutoUpper]) mapaPendentes[nomeProdutoUpper] = { nome: nomeProdutoUpper, demanda: 0, unidade: p.unidade_medida || "UN", lojas: [] };
            mapaPendentes[nomeProdutoUpper].demanda += Number(p.quantidade || 0);
            mapaPendentes[nomeProdutoUpper].lojas.push({ id_pedido: p.id, loja_id: idLoja, nome_fantasia: nomeLoja, qtd_pedida: Number(p.quantidade || 0) });
            
            // Cria o alerta na aba Fornecedores se existir o prefixo
            if (isAlertaFornecedor && nomeFornOriginal) {
               if (!mapaForn[nomeFornOriginal]) {
                   mapaForn[nomeFornOriginal] = { nome: nomeFornOriginal, chavePix: '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalDescontoBonif: 0, qtdBonificadaGeral: 0, totalGeral: 0, lojas: {}, alertas: [] };
               }
               if (!mapaForn[nomeFornOriginal].alertas.includes(nomeProdutoUpper)) {
                   mapaForn[nomeFornOriginal].alertas.push(nomeProdutoUpper);
               }
            }

          } else {
            if (!mapaFeitos[nomeProdutoUpper]) mapaFeitos[nomeProdutoUpper] = { nome: nomeProdutoUpper, total_resolvido: 0, status: p.status_compra, unidade: p.unidade_medida || "UN", itens: [] };
            mapaFeitos[nomeProdutoUpper].total_resolvido += Number(p.quantidade || 0);
            mapaFeitos[nomeProdutoUpper].itens.push(p);
          }

          // 2. ABA RESUMO DE ITENS
          if (!mapaGeralItens[nomeProdutoUpper]) {
             mapaGeralItens[nomeProdutoUpper] = {
                nome: nomeProdutoUpper, unidade: p.unidade_medida || "UN", total_solicitado: 0, total_comprado: 0, isFaltaTotal: false, temBoleto: false, fornecedores_comprados: {}
             };
          }
          mapaGeralItens[nomeProdutoUpper].total_solicitado += Number(p.quantidade || 0);

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             mapaGeralItens[nomeProdutoUpper].total_comprado += Number(p.qtd_atendida || 0);
             let fName = p.fornecedor_compra ? p.fornecedor_compra.toUpperCase() : 'DESCONHECIDO';
             if (fName.startsWith('ALERTA|')) fName = fName.replace('ALERTA|', '');
             
             if (!mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName]) {
                 mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName] = 0;
             }
             mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName] += Number(p.qtd_atendida || 0);
          }
          if (p.status_compra === 'falta') {
             mapaGeralItens[nomeProdutoUpper].total_solicitado -= Number(p.quantidade || 0); 
          }

          // 3. ABA ORIGINAL FORNECEDORES
          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             let fNome = String(p.fornecedor_compra || '').toUpperCase();
             if (fNome.startsWith('ALERTA|')) fNome = fNome.replace('ALERTA|', '');

             if (fNome && fNome !== 'REFAZER') {
                 if (!mapaForn[fNome]) {
                     const fInfo = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fNome);
                     mapaForn[fNome] = {
                         nome: fNome, chavePix: fInfo ? fInfo.chave_pix : '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalDescontoBonif: 0, qtdBonificadaGeral: 0, totalGeral: 0, lojas: {}, alertas: []
                     };
                 }

                 const isBoleto = p.status_compra === 'boleto';
                 let baseVal = p.custo_unit;
                 let qtdBonifFornecedor = 0;
                 
                 if (String(p.custo_unit).includes('BONIFICAÇÃO |')) {
                     const partes = p.custo_unit.split('|');
                     qtdBonifFornecedor = parseInt(partes[0]) || 0;
                     baseVal = partes[1] ? partes[1].trim() : 'R$ 0,00';
                 }

                 const valNum = tratarPrecoNum(baseVal);
                 const qtdCobradaForn = Math.max(0, p.qtd_atendida - qtdBonifFornecedor);
                 const totalItemFornCobrado = qtdCobradaForn * valNum;
                 const valorEconomizadoBonif = qtdBonifFornecedor * valNum;

                 const placaBase = lojaInfo && lojaInfo.placa_caminhao ? lojaInfo.placa_caminhao.toUpperCase().trim() : 'SEM PLACA';
                 const complemento = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
                 const placaFinal = `${placaBase} | ${complemento}`;

                 if (!mapaForn[fNome].lojas[nomeLoja]) {
                     mapaForn[fNome].lojas[nomeLoja] = { nome: nomeLoja, placa: placaFinal, totalLoja: 0, itens: [] };
                 }

                 // 💡 Agrupamento Inteligente no Fornecedor baseado no NOME e no VALOR UNITÁRIO (Se mudar preço, cria linha nova)
                 const idxItemForn = mapaForn[fNome].lojas[nomeLoja].itens.findIndex(i => i.nome === nomeProdutoUpper && i.valor_unit === baseVal && i.isBoleto === isBoleto);

                 if (idxItemForn >= 0) {
                     mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].qtd += p.qtd_atendida;
                     mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].qtd_bonificada += qtdBonifFornecedor;
                     mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].totalNum += totalItemFornCobrado;
                 } else {
                     mapaForn[fNome].lojas[nomeLoja].itens.push({
                         id_pedido: p.id,
                         nome: nomeProdutoUpper,
                         qtd: p.qtd_atendida,
                         qtd_bonificada: qtdBonifFornecedor,
                         unidade: p.unidade_medida || 'UN',
                         valor_unit: baseVal,
                         totalNum: totalItemFornCobrado,
                         isBoleto: isBoleto
                     });
                 }

                 mapaForn[fNome].lojas[nomeLoja].totalLoja += totalItemFornCobrado;
                 mapaForn[fNome].totalBruto += (totalItemFornCobrado + valorEconomizadoBonif);
                 mapaForn[fNome].totalDescontoBonif += valorEconomizadoBonif;
                 mapaForn[fNome].qtdBonificadaGeral += qtdBonifFornecedor;
                 mapaForn[fNome].totalGeral += totalItemFornCobrado;

                 if (isBoleto) mapaForn[fNome].totalBoleto += totalItemFornCobrado;
                 else mapaForn[fNome].totalPix += totalItemFornCobrado;
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
        const prodRef = (prodData || []).find(p => (p.nome || '').toUpperCase() === item.nome);
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
    finally { setCarregando(false); }
  }

  useEffect(() => { carregarDados(); }, []);

  const resetarPedidosDoDia = async () => {
    if (!window.confirm("🚨 ATENÇÃO: Isso vai ZERAR todos os pedidos, boletos e faltas que você já processou hoje.\n\nTudo voltará para a aba de PENDENTES.\n\nDeseja realmente recomeçar?")) return;
    setCarregando(true);
    try {
      await supabase.from('pedidos').update({ status_compra: 'pendente', fornecedor_compra: '', custo_unit: '', qtd_atendida: 0 }).eq('data_pedido', hoje);
      setAbaAtiva('pendentes');
      carregarDados();
    } catch (err) { alert("Erro ao resetar: " + err.message); setCarregando(false); }
  };

  const desfazerFeito = async (item) => {
    if (!window.confirm(`Deseja editar o pedido "${item.nome}" e devolvê-lo para a lista de PENDENTES?`)) return;
    setCarregando(true);
    const promessas = item.itens.map(p => 
      supabase.from('pedidos').update({ fornecedor_compra: '', custo_unit: '', qtd_atendida: 0, status_compra: 'pendente' }).eq('id', p.id)
    );
    await Promise.all(promessas);
    carregarDados();
  };

  const marcarFaltaDireto = async (item, e) => {
    e.stopPropagation(); 
    setCarregando(true);
    const promessas = item.lojas.map(l => 
      supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido)
    );
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

  const gerarCustoUnitarioFinal = (precoBaseFinal, qtdBonificada) => {
     if (qtdBonificada > 0) return `${qtdBonificada} | ${precoBaseFinal}`;
     return precoBaseFinal;
  };

  const finalizarPedidoCompleto = async () => {
    if (dadosCompra.isFaltaGeral) {
      setCarregando(true);
      const promessas = lojasEnvolvidas.map(l => supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido));
      await Promise.all(promessas);
      setItemModal(null);
      return carregarDados();
    }

    const isAlgumBoleto = lojasEnvolvidas.some(l => l.isBoleto);
    if (!isAlgumBoleto && (!dadosCompra.fornecedor || !dadosCompra.valor_unit)) return alert("⚠️ Preencha o fornecedor e o valor unitário.");
    if (!dadosCompra.fornecedor) return alert("⚠️ Preencha o fornecedor.");

    const qtdDesejada = Number(dadosCompra.qtd_pedir) || 0;
    if (qtdDesejada <= 0) return alert("Quantidade inválida.");

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
    const statusGeral = isAlgumBoleto ? 'boleto' : 'atendido';

    setCarregando(true);
    let qtdRestanteParaDistribuir = qtdDesejada;
    const promessas = [];
    const pedidosParaClonar = [];

    lojasEnvolvidas.forEach(loja => {
      const bonificada = Number(loja.qtd_bonificada) || 0;

      if (qtdRestanteParaDistribuir >= loja.qtd_pedida) {
        const custoFormatado = gerarCustoUnitarioFinal(precoFinal, bonificada);
        promessas.push(supabase.from('pedidos').update({
          fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: custoFormatado, qtd_atendida: loja.qtd_pedida, status_compra: statusGeral
        }).eq('id', loja.id_pedido));
        qtdRestanteParaDistribuir -= loja.qtd_pedida;

      } else if (qtdRestanteParaDistribuir > 0) {
        const custoFormatado = gerarCustoUnitarioFinal(precoFinal, bonificada);
        promessas.push(supabase.from('pedidos').update({
          fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: custoFormatado, qtd_atendida: qtdRestanteParaDistribuir, quantidade: qtdRestanteParaDistribuir, status_compra: statusGeral
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

    await Promise.all(promessas);
    if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
    setItemModal(null);
    carregarDados();
  };

  const finalizarPedidoFracionado = async () => {
    const temCompra = lojasEnvolvidas.some(l => (Number(l.qtd_receber) > 0));
    const tudoBoleto = lojasEnvolvidas.every(l => Number(l.qtd_receber) === 0 || l.isBoleto);
    
    if (temCompra && !tudoBoleto && (!dadosCompra.fornecedor || !dadosCompra.valor_unit)) return alert("⚠️ Preencha fornecedor e valor unitário para os itens comprados fora de boleto.");
    if (temCompra && !dadosCompra.fornecedor) return alert("⚠️ O fornecedor é obrigatório.");

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';

    setCarregando(true);
    const promessas = [];
    const pedidosParaClonar = [];

    lojasEnvolvidas.forEach(loja => {
      const receber = Number(loja.qtd_receber) || 0;
      const bonificada = Number(loja.qtd_bonificada) || 0;
      
      if (receber > loja.qtd_pedida) return alert(`⚠️ A loja ${loja.nome_fantasia} pediu ${loja.qtd_pedida}. Não mande a mais!`);

      if (receber > 0) {
        const custoFormatado = gerarCustoUnitarioFinal(precoFinal, bonificada);
        promessas.push(supabase.from('pedidos').update({
          fornecedor_compra: dadosCompra.fornecedor.toUpperCase(), custo_unit: custoFormatado, qtd_atendida: receber, quantidade: receber, status_compra: loja.isBoleto ? 'boleto' : 'atendido'
        }).eq('id', loja.id_pedido));

        if (receber < loja.qtd_pedida) {
          const resto = loja.qtd_pedida - receber;
          const rowOriginal = pedidosRaw.find(p => p.id === loja.id_pedido);
          if (rowOriginal) {
            const { id, created_at, ...dadosLimpos } = rowOriginal;
            pedidosParaClonar.push({ ...dadosLimpos, quantidade: resto, qtd_atendida: 0, status_compra: loja.isFalta ? 'falta' : 'pendente', custo_unit: loja.isFalta ? 'FALTA' : '', fornecedor_compra: '' });
          }
        }
      } else {
        if (loja.isFalta) promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', loja.id_pedido));
      }
    });

    await Promise.all(promessas);
    if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
    setItemModal(null);
    carregarDados();
  };

  // 💡 LÓGICA PARA LIMPAR ALERTA DE FORNECEDOR (Remove o Prefixo e zera o fornecedor no pendente)
  const limparAlertaFornecedor = async (nomeForn) => {
     setCarregando(true);
     await supabase.from('pedidos').update({ fornecedor_compra: '' }).eq('data_pedido', hoje).eq('status_compra', 'pendente').like('fornecedor_compra', `ALERTA|${nomeForn}`);
     carregarDados();
  };

  const desfazerCompra = async (idPedido) => {
    setCarregando(true);
    await supabase.from('pedidos').update({ fornecedor_compra: '', custo_unit: '', qtd_atendida: 0, status_compra: 'pendente' }).eq('id', idPedido);
    carregarDados();
  };

  // 💡 MENSAGEM WHATSAPP FORNECEDOR REFINADA E EXATA (Quantidade - Produto - Valor = Total)
  const gerarPedidoGeral = (f, btnId) => {
    const nomeLoja = lojaGeralSelecionada[f.nome];
    if (!nomeLoja) return alert("⚠️ Selecione a loja titular da banca para o cabeçalho.");

    const lojaTitular = f.lojas[nomeLoja];
    const nomeFormatado = nomeLoja.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();

    const placaBase = lojaTitular && lojaTitular.placa ? lojaTitular.placa.split('|')[0].trim() : 'SEM PLACA';
    const complemento = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
    
    // Agrupa os itens para o fornecedor
    const mapaItensGerais = {};
    Object.values(f.lojas).forEach(loja => {
      loja.itens.forEach(item => {
        if (!mapaItensGerais[item.nome]) {
          mapaItensGerais[item.nome] = { ...item, qtd: 0, totalNum: 0, qtd_bonificada: 0 };
        }
        mapaItensGerais[item.nome].qtd += item.qtd;
        mapaItensGerais[item.nome].qtd_bonificada += item.qtd_bonificada;
        mapaItensGerais[item.nome].totalNum += item.totalNum;
      });
    });

    let msg = `*${nomeFormatado}*\n\n`;
    let strNormais = '';
    let strBonif = '';
    
    Object.values(mapaItensGerais).forEach(i => {
       const qtdCobrada = i.qtd - i.qtd_bonificada;
       let basePriceClean = i.valor_unit.includes('|') ? i.valor_unit.split('|')[1].trim() : i.valor_unit;

       if (qtdCobrada > 0) {
          strNormais += `${qtdCobrada} - ${formatarNomeItem(i.nome)} - ${basePriceClean} = ${formatarMoeda(i.totalNum)}${i.isBoleto ? ' (B)' : ''}\n`;
       }
       if (i.qtd_bonificada > 0) {
          const basePriceNum = tratarPrecoNum(basePriceClean);
          const valBonif = basePriceNum * i.qtd_bonificada;
          strBonif += `${i.qtd_bonificada} - ${formatarNomeItem(i.nome)} - ${formatarMoeda(valBonif)}\n`;
       }
    });

    msg += strNormais;

    if (f.totalDescontoBonif > 0) {
       msg += `\n*Bonificações:*\n${strBonif}`;
       msg += `\nValor bruto = ${formatarMoeda(f.totalBruto)}\n`;
    }

    msg += `Total a pagar = ${formatarMoeda(f.totalGeral)}`;
    msg += `\n\n${placaBase} - ${complemento}`;

    navigator.clipboard.writeText(msg);
    setCopiadoGeral(btnId);
    setTimeout(() => setCopiadoGeral(null), 2000);
  };

  const copiarMensagemWhatsapp = (lojaNome, lojaData, btnId) => {
    const nomeFormatado = lojaNome.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();
    const partesPlaca = lojaData.placa.split(' | ');
    const placaBase = partesPlaca[0];
    const complemento = partesPlaca[1];

    let msg = `*${nomeFormatado}*\n\n`;
    lojaData.itens.forEach(i => { msg += `${i.qtd} ${i.unidade} : ${formatarNomeItem(i.nome)}\n`; });
    msg += `\n${placaBase} - ${complemento}`;
    
    navigator.clipboard.writeText(msg);
    setCopiadoLoja(btnId);
    setTimeout(() => setCopiadoLoja(null), 2000);
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

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Processando...</div>;

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px', padding: '10px' }}>
      
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>🛒 MESA DE COMPRAS</h2>
            <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Planejamento: {dataBr}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            <button onClick={resetarPedidosDoDia} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(239,68,68,0.4)' }}>
              🚨 ZERAR TUDO E RECOMEÇAR
            </button>
            <div style={{ display: 'flex', backgroundColor: '#333', borderRadius: '10px', padding: '4px' }}>
              <button onClick={() => setLocalCompra('ceasa')} style={{ border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: localCompra === 'ceasa' ? '#f97316' : 'transparent', color: localCompra === 'ceasa' ? '#fff' : '#999' }}>CEASA</button>
              <button onClick={() => setLocalCompra('ceilandia')} style={{ border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: localCompra === 'ceilandia' ? '#f97316' : 'transparent', color: localCompra === 'ceilandia' ? '#fff' : '#999' }}>CEILÂNDIA</button>
            </div>
          </div>
        </div>
      </div>

      {/* 💡 ABAS DE NAVEGAÇÃO COMPLETA */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button onClick={() => setAbaAtiva('pendentes')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pendentes' ? '#f97316' : '#fff', color: abaAtiva === 'pendentes' ? '#fff' : '#64748b' }}>
          📋 PENDENTES ({demandas.length})
        </button>
        <button onClick={() => setAbaAtiva('feitos')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'feitos' ? '#3b82f6' : '#fff', color: abaAtiva === 'feitos' ? '#fff' : '#64748b' }}>
          ✅ FEITOS ({pedidosFeitos.length})
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#111' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#64748b' }}>
          📇 FORNECEDORES ({fornecedoresBd.length})
        </button>
        <button onClick={() => setAbaAtiva('lista_fornecedores')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'lista_fornecedores' ? '#8b5cf6' : '#fff', color: abaAtiva === 'lista_fornecedores' ? '#fff' : '#64748b' }}>
          📦 RESUMO ITENS
        </button>
      </div>

      <datalist id="lista-fornecedores">
        {fornecedoresBd.map(f => <option key={f.id} value={f.nome} />)}
      </datalist>

      {/* ABA 1: PENDENTES */}
      {abaAtiva === 'pendentes' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar pendência..." value={buscaPendentes} onChange={e => setBuscaPendentes(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {demandas.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#22c55e', backgroundColor: '#fff', borderRadius: '16px', fontWeight: 'bold' }}>🎉 Zero pendências!</div>
            ) : (
              demandas.filter(d => d.nome.toLowerCase().includes(buscaPendentes.toLowerCase())).map(item => (
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
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ABA 2: FEITOS */}
      {abaAtiva === 'feitos' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar concluídos..." value={buscaFeitos} onChange={e => setBuscaFeitos(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {pedidosFeitos.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '16px' }}>Nada concluído ainda.</div>
            ) : (
              pedidosFeitos.filter(d => d.nome.toLowerCase().includes(buscaFeitos.toLowerCase())).map(item => (
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

      {/* ABA 3: FORNECEDORES ORIGINAL RESTAURADA E COM ALERTA */}
      {abaAtiva === 'fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Buscar fornecedor..." value={buscaFornecedores} onChange={e => setBuscaFornecedores(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          {fornecedoresBd.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum fornecedor acionado.</div>
          ) : (
            fornecedoresBd.filter(f => f.nome.toLowerCase().includes(buscaFornecedores.toLowerCase())).map((f, idx) => {
              const expandido = fornExpandido === f.nome;
              const temAlerta = f.precisaRefazer;
              
              return (
                <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '20px', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', borderTop: temAlerta ? '6px solid #ef4444' : '6px solid #111' }}>
                  
                  <div onClick={() => setFornExpandido(expandido ? null : f.nome)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: temAlerta ? '#ef4444' : '#111', textTransform: 'uppercase' }}>
                       🏢 {f.nome} {temAlerta && '⚠️'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <strong style={{ color: '#22c55e', fontSize: '18px' }}>{formatarMoeda(f.totalGeral)}</strong>
                      <span style={{ color: '#ccc', transform: expandido ? 'rotate(90deg)' : 'none', transition: '0.2s' }}>❯</span>
                    </div>
                  </div>

                  {expandido && (
                    <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                      
                      {/* 💡 ALERTA DE MODIFICAÇÃO VINDO DO FECHAMENTO */}
                      {temAlerta && (
                         <div style={{ backgroundColor: '#fef2f2', border: '1px dashed #ef4444', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                            <strong style={{ color: '#ef4444', fontSize: '12px', display: 'block', marginBottom: '5px' }}>🚨 ATENÇÃO: PEDIDO MODIFICADO NO FECHAMENTO!</strong>
                            <p style={{ fontSize: '11px', color: '#991b1b', margin: '0 0 10px 0' }}>
                               Os itens a seguir foram desfeitos, marcados como falta ou tiveram preço alterado nas lojas. Eles <b>voltaram para a aba de PENDENTES</b>:
                               <br/><b>{f.alertas.join(', ')}</b>
                            </p>
                            <button onClick={() => limparAlertaFornecedor(f.nome)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
                               ✅ CIENTE (Omitir Alerta)
                            </button>
                         </div>
                      )}

                      <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#111' }}>🛍️ PEDIDO GERAL DA BANCA</h4>
                        
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <select 
                              value={lojaGeralSelecionada[f.nome] || ''}
                              onChange={e => setLojaGeralSelecionada({...lojaGeralSelecionada, [f.nome]: e.target.value})}
                              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold' }}
                          >
                              <option value="">Escolha a loja do cabeçalho...</option>
                              {Object.keys(f.lojas).map((nomeLoja, i) => (
                                  <option key={i} value={nomeLoja}>{nomeLoja.replace(/^\d+\s*-\s*/, '').trim().toUpperCase()}</option>
                              ))}
                          </select>
                          <button 
                              onClick={() => gerarPedidoGeral(f, `geral_${f.nome}`)} 
                              style={{ background: copiadoGeral === `geral_${f.nome}` ? '#22c55e' : '#111', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer', transition: '0.2s' }}
                          >
                              {copiadoGeral === `geral_${f.nome}` ? '✅ COPIADO!' : '📋 COPIAR GERAL'}
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
                                {loja.itens.map(item => (
                                  <div key={item.id_pedido} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                      <span>{item.qtd} {item.unidade} : <b>{formatarNomeItem(item.nome)}</b></span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      {item.qtd_bonificada > 0 && (
                                        <span style={{ fontSize: '9px', background: '#dcfce7', color: '#166534', padding: '2px 5px', borderRadius: '4px', fontWeight: 'bold' }}>🎁 {item.qtd_bonificada} Bonif.</span>
                                      )}
                                      <span style={{ fontWeight: 'bold', color: item.isBoleto ? '#d97706' : '#333' }}>
                                        {formatarMoeda(item.totalNum)} {item.isBoleto && '(B)'}
                                      </span>
                                      <button onClick={() => desfazerCompra(item.id_pedido)} title="Desfazer" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0' }}>🗑️</button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button 
                                onClick={() => copiarMensagemWhatsapp(loja.nome, loja, btnId)} 
                                style={{ width: '100%', background: copiadoLoja === btnId ? '#dcfce7' : '#25d366', color: copiadoLoja === btnId ? '#166534' : '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', transition: '0.2s' }}
                              >
                                {copiadoLoja === btnId ? '✅ COPIADO PARA O WHATSAPP' : '🟢 COPIAR LISTA DA LOJA'}
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

      {/* 💡 ABA 4 NOVA: LISTA RESUMO DE ITENS CONSOLIDADA */}
      {abaAtiva === 'lista_fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Buscar produto..." value={buscaFornList} onChange={e => setBuscaFornList(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          {/* 💡 LEGENDA DE CORES */}
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
              listaGeralItens.filter(f => f.nome.toLowerCase().includes(buscaFornList.toLowerCase())).map((item, idx) => {
                
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

                    {cardExpandido && Object.keys(item.fornecedores_comprados).length > 0 && (
                      <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: `1px dashed ${corBorda}` }}>
                         <span style={{ fontSize: '10px', fontWeight: 'bold', color: corTexto, opacity: 0.8, display: 'block', marginBottom: '8px' }}>COMPRADO COM:</span>
                         {Object.entries(item.fornecedores_comprados).map(([fornNome, qtd]) => (
                             <div key={fornNome} style={{ fontSize: '12px', color: corTexto, fontWeight: 'bold', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                 <span>🏢 {fornNome}</span>
                                 <span>{qtd}x</span>
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

      {/* MODAL DE COMPRA */}
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
              FINALIZAR PEDIDO {abaModal === 'fracionado' ? 'FRACIONADO' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
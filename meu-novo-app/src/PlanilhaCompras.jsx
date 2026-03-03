import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function PlanilhaCompras() {
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
  const [localCompra, setLocalCompra] = useState('ceasa'); 

  const [copiadoGeral, setCopiadoGeral] = useState(null);
  const [copiadoLoja, setCopiadoLoja] = useState(null);
  const [fornecedorDestaque, setFornecedorDestaque] = useState(null);

  // 💡 ESTADOS DO NOVO SISTEMA DE AGRUPAMENTO
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [nomeFornecedorLote, setNomeFornecedorLote] = useState('');
  const [agrupamentos, setAgrupamentos] = useState(() => {
    try {
      const salvo = localStorage.getItem('agrupamentos_virtus');
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });
  const [precosAgrupados, setPrecosAgrupados] = useState({});

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('agrupamentos_virtus', JSON.stringify(agrupamentos));
  }, [agrupamentos]);

  const extrairNum = (valor) => {
    const num = String(valor || "").match(/\d+/);
    return num ? parseInt(num[0], 10) : null;
  };

  const tratarPrecoNum = (p) => parseFloat(String(p || '0').replace('R$', '').trim().replaceAll('.', '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarNomeItem = (str) => {
    if (!str || typeof str !== 'string' || str.trim() === '') return 'Sem Nome';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    // Implementação simples de notificação para não travar (já que a outra tela de cliente tem a completa)
    alert(mensagem); 
  };

  async function carregarDados(silencioso = false) {
    if (!silencioso) setCarregando(true);
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
        const nomeProdutoUpper = String(p.nome_produto || "DESCONHECIDO").toUpperCase();

        if (idLoja && idLoja > 1) { 
          const lojaInfo = (lojasData || []).find(l => extrairNum(l.codigo_loja) === idLoja);
          const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${idLoja}`;

          let isAlertaFornecedor = false;
          let nomeFornOriginal = String(p.fornecedor_compra || '').toUpperCase();
          
          if (nomeFornOriginal.startsWith('ALERTA|')) {
             isAlertaFornecedor = true;
             nomeFornOriginal = nomeFornOriginal.replace('ALERTA|', '');
          }

          if (p.status_compra === 'pendente') {
            if (!mapaPendentes[nomeProdutoUpper]) mapaPendentes[nomeProdutoUpper] = { nome: nomeProdutoUpper, demanda: 0, unidade: String(p.unidade_medida || "UN"), lojas: [] };
            mapaPendentes[nomeProdutoUpper].demanda += Number(p.quantidade || 0);
            mapaPendentes[nomeProdutoUpper].lojas.push({ id_pedido: p.id, loja_id: idLoja, nome_fantasia: nomeLoja, qtd_pedida: Number(p.quantidade || 0) });
            
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
            mapaFeitos[nomeProdutoUpper].total_resolvido += Number(p.quantidade || 0);
            mapaFeitos[nomeProdutoUpper].itens.push(p);
          }

          if (!mapaGeralItens[nomeProdutoUpper]) {
             mapaGeralItens[nomeProdutoUpper] = {
                nome: nomeProdutoUpper, unidade: String(p.unidade_medida || "UN"), total_solicitado: 0, total_comprado: 0, isFaltaTotal: false, temBoleto: false, fornecedores_comprados: {}
             };
          }
          mapaGeralItens[nomeProdutoUpper].total_solicitado += Number(p.quantidade || 0);

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             mapaGeralItens[nomeProdutoUpper].total_comprado += Number(p.qtd_atendida || 0);
             let fNameRaw = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'DESCONHECIDO';
             let fName = fNameRaw.replace('ALERTA|', '').trim();
             
             const fornInfoParaPJ = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fName);
             let displayFornName = fName;
             if (fornInfoParaPJ && String(fornInfoParaPJ.tipo_chave_pix || '').toUpperCase() === 'CNPJ') displayFornName = `${fName} (PJ)`;
             if (p.status_compra === 'boleto') displayFornName += ' (B)';
             
             if (!mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName]) {
                 mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName] = { qtd: 0, isBoleto: p.status_compra === 'boleto' };
             }
             mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName].qtd += Number(p.qtd_atendida || 0);
             if (p.status_compra === 'boleto') mapaGeralItens[nomeProdutoUpper].temBoleto = true;
          }
          
          if (p.status_compra === 'falta') {
             mapaGeralItens[nomeProdutoUpper].total_solicitado -= Number(p.quantidade || 0); 
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
                     const partes = baseVal.split('|');
                     qtdBonifFornecedor = parseInt(partes[0]) || 0;
                     baseVal = partes[1] ? partes[1].trim() : 'R$ 0,00';
                 }

                 const valNum = tratarPrecoNum(baseVal);
                 const baseValFormatado = valNum > 0 ? formatarMoeda(valNum) : baseVal; 
                 
                 const qtdCobradaForn = Math.max(0, p.qtd_atendida - qtdBonifFornecedor);
                 const totalItemFornCobrado = qtdCobradaForn * valNum;
                 const valorEconomizadoBonif = qtdBonifFornecedor * valNum;

                 const placaBase = lojaInfo && lojaInfo.placa_caminhao ? String(lojaInfo.placa_caminhao).toUpperCase().trim() : 'SEM PLACA';
                 const complemento = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
                 const placaFinal = `${placaBase} | ${complemento}`;

                 if (!mapaForn[fNome].lojas[nomeLoja]) {
                     mapaForn[fNome].lojas[nomeLoja] = { nome: nomeLoja, placa: placaFinal, totalLoja: 0, itens: [] };
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

                 if (isBoleto) mapaForn[fNome].totalBoleto += totalItemFornCobrado;
                 else mapaForn[fNome].totalPix += totalItemFornCobrado;
             }
          }
        }
      });

      Object.values(mapaGeralItens).forEach(item => {
         if (item.total_solicitado <= 0 && item.total_comprado <= 0) item.isFaltaTotal = true;
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
  }

  useEffect(() => { carregarDados(); }, []);

  const gerarCustoUnitarioFinal = (precoBaseFinal, qtdBonificada) => {
     if (qtdBonificada > 0) return `BONIFICAÇÃO | ${precoBaseFinal}`;
     return precoBaseFinal;
  };

  // 💡 OTIMIZAÇÃO: FINALIZAÇÃO RÁPIDA (SEM TRAVAR A TELA)
  const finalizarPedidoCompleto = () => {
    if (!dadosCompra.isFaltaGeral && !dadosCompra.fornecedor) return alert("⚠️ Preencha o fornecedor.");

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
    const isAlgumBoleto = lojasEnvolvidas.some(l => l.isBoleto);
    const statusGeral = isAlgumBoleto ? 'boleto' : 'atendido';
    const qtdDesejada = Number(dadosCompra.qtd_pedir) || 0;

    const promessas = [];
    const pedidosParaClonar = [];
    let qtdRestanteParaDistribuir = qtdDesejada;

    // FECHA O MODAL NA HORA PARA O CLIENTE NÃO FICAR ESPERANDO
    setItemModal(null);
    setCarregando(true); // Opcional: pode deixar false se quiser 100% invisível

    if (dadosCompra.isFaltaGeral) {
      lojasEnvolvidas.forEach(l => promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido)));
    } else {
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
    }

    // EXECUÇÃO EM SEGUNDO PLANO
    Promise.all(promessas).then(async () => {
      if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
      mostrarNotificacao("✔️ Pedido processado!", "sucesso");
      carregarDados(true); // Atualiza os dados silenciosamente
      setCarregando(false);
    });
  };

  const finalizarPedidoFracionado = () => {
    const temCompra = lojasEnvolvidas.some(l => (Number(l.qtd_receber) > 0));
    if (temCompra && !dadosCompra.fornecedor) return alert("⚠️ O fornecedor é obrigatório.");

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';

    setItemModal(null); // FECHA MODAL INSTANTANEAMENTE
    setCarregando(true);

    const promessas = [];
    const pedidosParaClonar = [];

    lojasEnvolvidas.forEach(loja => {
      const receber = Number(loja.qtd_receber) || 0;
      const bonificada = Number(loja.qtd_bonificada) || 0;
      
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
      } else if (loja.isFalta) {
        promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', loja.id_pedido));
      }
    });

    // EXECUÇÃO EM SEGUNDO PLANO
    Promise.all(promessas).then(async () => {
      if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
      mostrarNotificacao("✔️ Pedido fracionado salvo!", "sucesso");
      carregarDados(true);
      setCarregando(false);
    });
  };

  // 💡 LÓGICAS DO NOVO AGRUPAMENTO DE FORNECEDOR
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
      itens: itensSelecionados
    };
    
    setAgrupamentos(prev => [...prev, novoGrupo]);
    setItensSelecionados([]);
    setNomeFornecedorLote('');
    mostrarNotificacao(`Itens separados para ${novoGrupo.fornecedor}`, 'sucesso');
    setAbaAtiva('pedidos_fornecedor'); // Pula para a aba de execução
  };

  const removerGrupoFornecedor = (idGrupo) => {
    setAgrupamentos(prev => prev.filter(g => g.id !== idGrupo));
  };

  const copiarWhatsappAgrupado = (grupo) => {
    let msg = `*PEDIDO: ${grupo.fornecedor.toUpperCase()}*\n\n`;
    const lojasMap = {};
    
    grupo.itens.forEach(nomeItem => {
       const demandaItem = demandas.find(d => d.nome === nomeItem);
       if(!demandaItem) return;
       demandaItem.lojas.forEach(loja => {
          if(!lojasMap[loja.nome_fantasia]) {
             const lojaInfo = lojasBd.find(l => parseInt(l.codigo_loja) === loja.loja_id);
             const placaBase = lojaInfo?.placa_caminhao ? lojaInfo.placa_caminhao.split('|')[0].trim() : 'SEM PLACA';
             const comp = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
             lojasMap[loja.nome_fantasia] = { placa: `${placaBase} - ${comp}`, itens: [] };
          }
          lojasMap[loja.nome_fantasia].itens.push(`${loja.qtd_pedida} ${demandaItem.unidade} : ${formatarNomeItem(nomeItem)}`);
       });
    });
    
    Object.entries(lojasMap).forEach(([nomeLoja, dados]) => {
       msg += `*${nomeLoja.replace(/^\d+\s*-\s*/, '').trim().toUpperCase()}*\n`;
       dados.itens.forEach(i => msg += `${i}\n`);
       msg += `\n${dados.placa}\n\n`;
    });
    
    navigator.clipboard.writeText(msg);
    alert('✅ Lista formatada copiada para o WhatsApp!');
  };

  const finalizarLoteFornecedor = (grupoId, isBoletoLote) => {
    const grupo = agrupamentos.find(g => g.id === grupoId);
    if (!grupo) return;

    setCarregando(true);
    const promessas = [];
    
    grupo.itens.forEach(nomeItem => {
        const demandaItem = demandas.find(d => d.nome === nomeItem);
        // Busca o preço digitado (se estiver vazio, ignora o item)
        const precoDigitado = precosAgrupados[`${grupoId}_${nomeItem}`];
        
        if (!precoDigitado || !demandaItem) return;

        let precoLimpo = precoDigitado.replace(/[^\d,.-]/g, '').trim();
        if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
        const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';

        demandaItem.lojas.forEach(loja => {
            promessas.push(supabase.from('pedidos').update({
                fornecedor_compra: grupo.fornecedor,
                custo_unit: precoFinal,
                qtd_atendida: loja.qtd_pedida,
                status_compra: isBoletoLote ? 'boleto' : 'atendido'
            }).eq('id', loja.id_pedido));
        });
    });
    
    // Remove o grupo da tela imediatamente
    setAgrupamentos(prev => prev.filter(g => g.id !== grupoId));
    
    Promise.all(promessas).then(() => {
        mostrarNotificacao(`✅ Preços de ${grupo.fornecedor} lançados com sucesso!`, 'sucesso');
        carregarDados(true);
        setCarregando(false);
    });
  };

  // Funções legadas da tela modal normal...
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
        return novaLoja;
      }
      return l;
    }));
  };

  // Demais funções legadas mantidas idênticas (reset, pdf, desfazer, marcar falta direta)
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

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Processando rápido...</div>;

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

      {/* TABS MENU */}
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
      </div>

      <datalist id="lista-fornecedores">
        {fornecedoresBd.map(f => <option key={f.id} value={f.nome} />)}
      </datalist>

      {/* ABA 1: PENDENTES (Normal) */}
      {abaAtiva === 'pendentes' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar pendência..." value={buscaPendentes} onChange={e => setBuscaPendentes(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {demandas.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#22c55e', backgroundColor: '#fff', borderRadius: '16px', fontWeight: 'bold' }}>🎉 Zero pendências!</div>
            ) : (
              demandas.filter(d => (d.nome || '').toLowerCase().includes(buscaPendentes.toLowerCase())).map(item => (
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

      {/* ABA NOVA: SELECIONAR FORNECEDORES */}
      {abaAtiva === 'selecionar_forn' && (
        <div style={{ paddingBottom: '80px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Filtrar para selecionar..." value={buscaSelecionar} onChange={e => setBuscaSelecionar(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {demandas.filter(d => (d.nome || '').toLowerCase().includes(buscaSelecionar.toLowerCase())).map(item => (
              <div key={item.nome} onClick={() => alternarSelecaoLote(item.nome)} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: itensSelecionados.includes(item.nome) ? '5px solid #8b5cf6' : '5px solid #e2e8f0', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                 <input type="checkbox" checked={itensSelecionados.includes(item.nome)} readOnly style={{ width: '20px', height: '20px', accentColor: '#8b5cf6', pointerEvents: 'none' }} />
                 <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#111' }}>{item.nome}</strong>
                    <small style={{ color: '#666', fontSize: '11px' }}>{item.demanda} {item.unidade} • {item.lojas.length} Loja(s)</small>
                 </div>
              </div>
            ))}
          </div>

          {/* BARRA FLUTUANTE DE AÇÃO */}
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

      {/* ABA NOVA: PEDIDOS POR FORNECEDOR (PREÇO E WHATSAPP) */}
      {abaAtiva === 'pedidos_fornecedor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {agrupamentos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum fornecedor agrupado. Vá na aba "Selecionar Forn." para criar.</div>
          ) : (
            agrupamentos.map((grupo) => (
              <div key={grupo.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: '5px solid #14b8a6' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, color: '#111', fontSize: '18px' }}>🏢 {grupo.fornecedor}</h3>
                    <button onClick={() => removerGrupoFornecedor(grupo.id)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>Desfazer</button>
                 </div>

                 {/* Botão de WhatsApp Rápido (Lojas separadas sem preço) */}
                 <button onClick={() => copiarWhatsappAgrupado(grupo)} style={{ width: '100%', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '15px', borderRadius: '12px', fontWeight: '900', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '20px', cursor: 'pointer' }}>
                   🟢 COPIAR PEDIDO PARA WHATSAPP
                 </button>

                 <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <h4 style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#64748b' }}>2. LANÇAR PREÇOS DO FORNECEDOR:</h4>
                    {grupo.itens.map(nomeItem => {
                       const demandaReal = demandas.find(d => d.nome === nomeItem);
                       if (!demandaReal) return null;
                       return (
                         <div key={nomeItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ flex: 1 }}>
                               <strong style={{ display: 'block', fontSize: '13px', color: '#111' }}>{nomeItem}</strong>
                               <small style={{ color: '#f97316', fontWeight: 'bold', fontSize: '10px' }}>Pediram: {demandaReal.demanda} {demandaReal.unidade}</small>
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
                    
                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                      <button onClick={() => finalizarLoteFornecedor(grupo.id, false)} style={{ flex: 1, padding: '15px', background: '#111', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>FECHAR À VISTA</button>
                      <button onClick={() => finalizarLoteFornecedor(grupo.id, true)} style={{ flex: 1, padding: '15px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>FECHAR NO BOLETO</button>
                    </div>
                 </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ABA 4: FEITOS E RESTANTE DOS COMPONENTES NORMAIS... */}
      {abaAtiva === 'feitos' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar concluídos..." value={buscaFeitos} onChange={e => setBuscaFeitos(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {pedidosFeitos.filter(d => (d.nome || '').toLowerCase().includes(buscaFeitos.toLowerCase())).map(item => (
              <div key={item.nome} onClick={() => desfazerFeito(item)} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderTop: '4px solid #3b82f6', opacity: 0.8, cursor: 'pointer' }}>
                <div style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '10px', borderRadius: '50%', fontWeight: '900', fontSize: '18px', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>{item.total_resolvido}</div>
                <strong style={{ fontSize: '13px', color: '#111', lineHeight: '1.2' }}>{item.nome}</strong>
                <span style={{ fontSize: '9px', color: '#666', marginTop: '5px' }}>{item.itens.length} NOTA(S)</span>
                <span style={{ fontSize: '9px', color: '#3b82f6', marginTop: '8px', fontWeight: 'bold' }}>Toque para editar</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MODAL DE COMPRA INDIVIDUAL */}
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
              <button onClick={() => setAbaModal('completo')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaModal === 'completo' ? '#fff' : 'transparent', color: abaModal === 'completo' ? '#111' : '#64748b' }}>📦 PEDIDO COMPLETO</button>
              <button onClick={() => setAbaModal('fracionado')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaModal === 'fracionado' ? '#fff' : 'transparent', color: abaModal === 'fracionado' ? '#111' : '#64748b' }}>🧩 PEDIDO FRACIONADO</button>
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
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              {abaModal === 'completo' && (
                <>
                  <div style={{ flex: 1, backgroundColor: '#fffbeb', padding: '15px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#d97706', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={lojasEnvolvidas.some(l => l.isBoleto)} disabled={dadosCompra.isFaltaGeral} onChange={(e) => setLojasEnvolvidas(lojasEnvolvidas.map(l => ({ ...l, isBoleto: e.target.checked })))} style={{ width: '20px', height: '20px' }} /> 📄 BOLETO
                    </label>
                  </div>
                  <div style={{ flex: 1, backgroundColor: '#fef2f2', padding: '15px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={dadosCompra.isFaltaGeral} onChange={(e) => { setDadosCompra({...dadosCompra, isFaltaGeral: e.target.checked, temBonificacao: false}); if (e.target.checked) setLojasEnvolvidas(lojasEnvolvidas.map(l => ({...l, qtd_bonificada: 0}))); }} style={{ width: '20px', height: '20px' }} /> 🚫 FALTA
                    </label>
                  </div>
                </>
              )}
            </div>

            <button onClick={abaModal === 'completo' ? finalizarPedidoCompleto : finalizarPedidoFracionado} style={{ width: '100%', padding: '20px', backgroundColor: dadosCompra.isFaltaGeral ? '#ef4444' : '#111', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}>
              FINALIZAR ITEM {abaModal === 'fracionado' ? 'FRACIONADO' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
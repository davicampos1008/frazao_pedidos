import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FechamentoLojas({ isEscuro }) {
  // 💡 FUNÇÕES DE DATA
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

  // 💡 ESTADOS DE DATA COM PERSISTÊNCIA
  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_fechamento_data') || obterDataLocal();
  });
  
  const dataFechamentoBr = calcularDataPosterior(dataFiltro);

  const [abaAtiva, setAbaAtiva] = useState('lojas'); 
  const [fechamentos, setFechamentos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedoresBd, setFornecedoresBd] = useState([]); 
  const [carregando, setCarregando] = useState(true);

  const [lojaExpandida, setLojaExpandida] = useState(null);
  const [lojaEmEdicao, setLojaEmEdicao] = useState(null);
  const [itensEditados, setItensEditados] = useState([]);
  const [buscaEdicao, setBuscaEdicao] = useState(''); 

  const [modoVisualizacaoImp, setModoVisualizacaoImp] = useState(false);
  const [tipoImpressao, setTipoImpressao] = useState(null); 
  const [lojaParaImprimir, setLojaParaImprimir] = useState(null);

  const [abaForn, setAbaForn] = useState('pendentes'); 
  const [fornExpandido, setFornExpandido] = useState(null);

  // 💡 ESTADOS PARA VALOR MÉDIA
  const [modalMediaAberto, setModalMediaAberto] = useState(false);
  const [itemMediaSelecionado, setItemMediaSelecionado] = useState('');
  const [valorMediaInput, setValorMediaInput] = useState('');

  const themeBg = isEscuro ? '#0f172a' : '#f5f5f4';
  const themeCard = isEscuro ? '#1e293b' : '#ffffff';
  const themeText = isEscuro ? '#f8fafc' : '#111111';
  const themeBorder = isEscuro ? '#334155' : '#e2e8f0';
  const themeMenuTop = isEscuro ? '#020617' : '#111111';

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('virtus_fechamento_data', dataFiltro);
    carregar();
  }, [dataFiltro]);

  const removerAcentos = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  const buscarFornecedorSimilar = (nomeDigitado, listaBd) => {
    if (!nomeDigitado) return null;
    const nm = removerAcentos(nomeDigitado).trim();
    if (!nm) return null;
    
    let match = listaBd.find(f => removerAcentos(f.nome_fantasia).trim() === nm);
    if (match) return match;
    
    match = listaBd.find(f => {
       const nmBd = removerAcentos(f.nome_fantasia).trim();
       return nmBd.includes(nm) || nm.includes(nmBd);
    });
    return match || null;
  };

  const extrairNum = (valor) => {
    const num = String(valor || "").match(/\d+/);
    return num ? parseInt(num[0], 10) : null;
  };

  const tratarPrecoNum = (p) => {
    if (!p || typeof p !== 'string') return 0;
    const strClean = String(p).replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(strClean) || 0;
  };

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  async function carregar() {
    setCarregando(true);
    try {
      const { data: lojasData } = await supabase.from('lojas').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      const { data: fornData } = await supabase.from('fornecedores').select('*'); 
      
      if (fornData) setFornecedoresBd(fornData);

      const mapaLojas = {};
      const mapaForn = {};

      (pedData || []).forEach(p => {
        if (p.status_compra === 'pendente') {
            const idLoja = extrairNum(p.loja_id);
            if (!idLoja || idLoja <= 1) return;
            if (!mapaLojas[idLoja]) {
              const lInfo = lojasData.find(l => extrairNum(l.codigo_loja) === idLoja);
              mapaLojas[idLoja] = { loja_id: idLoja, nome_fantasia: lInfo ? lInfo.nome_fantasia : `Loja ${idLoja}`, itens: [], totalFatura: 0, liberadoCliente: false, temPendencia: true };
            }
            mapaLojas[idLoja].itens.push({
                id_pedido: p.id,
                nome: String(p.nome_produto || "").toUpperCase(),
                unidade: p.unidade_medida || 'UN',
                qtdOriginal: p.quantidade,
                qtdEntregue: p.quantidade,
                qtd_bonificada: p.qtd_bonificada || 0,
                unitDisplay: 'AGUARDANDO COMPRA',
                totalDisplay: 'PENDENTE',
                valorNumerico: 0,
                isFalta: false,
                isBoleto: false,
                precoOriginal: '0,00',
                isBonif: false,
                isPendente: true, 
                fornecedor_original: String(p.fornecedor_compra || '').replace('ALERTA|', '') 
            });
            mapaLojas[idLoja].temPendencia = true;
            return;
        }

        // --- FORNECEDORES (NÃO MUDA NADA, USA CUSTO_UNIT) ---
        if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          let fNomeOriginal = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'SEM FORNECEDOR';
          if (fNomeOriginal.startsWith('ALERTA|')) fNomeOriginal = fNomeOriginal.replace('ALERTA|', '');
          
          const isBoleto = p.status_compra === 'boleto';
          const fNome = isBoleto ? `${fNomeOriginal} (BOLETO)` : fNomeOriginal;
          
          let baseVal = p.custo_unit;
          let qtdBonifFornecedor = Number(p.qtd_bonificada) || 0;
          
          if (String(p.custo_unit).includes('BONIFICAÇÃO |')) {
             baseVal = baseVal.split('|')[1] ? baseVal.split('|')[1].trim() : 'R$ 0,00';
          }

          const valNum = tratarPrecoNum(baseVal);
          const baseValFormatado = valNum > 0 ? formatarMoeda(valNum) : baseVal; 
          
          const qtdCobradaForn = Math.max(0, p.qtd_atendida - qtdBonifFornecedor);
          const totalItemFornCobrado = qtdCobradaForn * valNum;
          const valorEconomizadoBonif = qtdBonifFornecedor * valNum;

          if (!mapaForn[fNome]) {
            const fInfo = buscarFornecedorSimilar(fNomeOriginal, fornData || []);
            mapaForn[fNome] = { 
               nome: fNome, 
               nomeCadastrado: fInfo ? fInfo.nome_fantasia : fNomeOriginal,
               chavePix: fInfo ? fInfo.chave_pix : '', 
               telefone: fInfo ? fInfo.telefone : '', 
               totalPix: 0, 
               totalBoleto: 0, 
               totalBruto: 0,
               totalDescontoBonif: 0,
               qtdBonificadaGeral: 0,
               itens: [], 
               lojasEnvolvidas: {},
               statusPagamento: 'pendente' 
            };
          }

          const idLojaForn = extrairNum(p.loja_id);
          const lInfoForn = (lojasData || []).find(l => extrairNum(l.codigo_loja) === idLojaForn);
          const nomeLojaForn = lInfoForn ? lInfoForn.nome_fantasia : `Loja ${idLojaForn}`;
          
          mapaForn[fNome].lojasEnvolvidas[nomeLojaForn] = lInfoForn || { nome_fantasia: nomeLojaForn, placa_caminhao: 'SEM PLACA' };

          const itemExistenteIndex = mapaForn[fNome].itens.findIndex(i => 
              i.nomeItem === p.nome_produto && 
              i.isBoleto === isBoleto && 
              tratarPrecoNum(i.valUnit) === valNum
          );

          if (itemExistenteIndex >= 0) {
              const itEx = mapaForn[fNome].itens[itemExistenteIndex];
              itEx.qtd += p.qtd_atendida;
              itEx.qtdBonificada += qtdBonifFornecedor;
              itEx.totalCobrado += totalItemFornCobrado;
              itEx.totalBonificado += valorEconomizadoBonif;
          } else {
              mapaForn[fNome].itens.push({ 
                nomeItem: p.nome_produto, 
                unidade: p.unidade_medida || 'UN',
                qtd: p.qtd_atendida,
                qtdBonificada: qtdBonifFornecedor,
                valUnit: baseValFormatado, 
                totalCobrado: totalItemFornCobrado,
                totalBonificado: valorEconomizadoBonif,
                isBoleto 
              });
          }

          mapaForn[fNome].totalBruto += (totalItemFornCobrado + valorEconomizadoBonif);
          mapaForn[fNome].totalDescontoBonif += valorEconomizadoBonif;
          mapaForn[fNome].qtdBonificadaGeral += qtdBonifFornecedor;

          if (isBoleto) {
            mapaForn[fNome].totalBoleto += totalItemFornCobrado;
          } else {
            mapaForn[fNome].totalPix += totalItemFornCobrado;
          }
        }

        // --- LOJAS (AQUI PRIORIZAMOS O PRECO_VENDA PARA O FECHAMENTO) ---
        const idLoja = extrairNum(p.loja_id);
        if (!idLoja || idLoja <= 1) return;

        if (!mapaLojas[idLoja]) {
          const lInfo = lojasData.find(l => extrairNum(l.codigo_loja) === idLoja);
          mapaLojas[idLoja] = {
            loja_id: idLoja,
            nome_fantasia: lInfo ? lInfo.nome_fantasia : `Loja ${idLoja}`,
            itens: [],
            totalFatura: 0,
            liberadoCliente: false,
            temPendencia: false
          };
        }

        const isFalta = p.status_compra === 'falta' || p.qtd_atendida === 0;
        const isBoleto = p.status_compra === 'boleto';
        
        let qtdDisplay = p.quantidade; 
        let qtdBonificada = Number(p.qtd_bonificada) || 0;
        
        // 💡 Lógica de prioridade de preço para a loja (Usa a média se existir, senão usa o original)
        let unitParaLoja = p.preco_venda || p.custo_unit || 'R$ 0,00';
        let unitDisplay = unitParaLoja;
        let totalItem = 0;
        let totalDisplay = '';
        let precoOriginal = unitParaLoja;
        let isBonif = false;

        if (isFalta) {
          unitDisplay = 'FALTA';
          totalDisplay = 'FALTA';
        } else if (String(unitParaLoja).includes('BONIFICAÇÃO |')) {
          const parts = unitParaLoja.split('|');
          precoOriginal = parts[1] ? parts[1].trim() : 'R$ 0,00';
          const pUnit = tratarPrecoNum(precoOriginal);
          qtdDisplay = p.qtd_atendida;
          
          const restCobrado = qtdDisplay - qtdBonificada;
          totalItem = restCobrado > 0 ? restCobrado * pUnit : 0;
          totalDisplay = formatarMoeda(totalItem);

          if (qtdBonificada >= qtdDisplay) {
              unitDisplay = 'BONIFIC.';
              totalDisplay = 'BONIFIC.';
              isBonif = true;
          } else if (isBoleto) {
              unitDisplay = `${qtdBonificada} = BONIFIC.`;
              totalDisplay = 'BOLETO';
          } else {
              unitDisplay = `${qtdBonificada} = BONIFIC.`;
          }

        } else if (isBoleto) {
          unitDisplay = 'BOLETO';
          totalDisplay = 'BOLETO';
        } else {
          qtdDisplay = p.qtd_atendida; 
          const valNum = tratarPrecoNum(unitParaLoja);
          
          const restCobrado = Math.max(0, qtdDisplay - qtdBonificada);
          totalItem = restCobrado * valNum;
          totalDisplay = formatarMoeda(totalItem); 
          
          if(qtdBonificada > 0) {
             unitDisplay = `${qtdBonificada} = BONIFIC.`;
             if(qtdBonificada >= qtdDisplay) {
                 totalItem = 0;
                 totalDisplay = 'BONIFIC.';
                 isBonif = true;
             }
          }
        }

        const nomeUpper = String(p.nome_produto || '').toUpperCase();
        const idxExistente = mapaLojas[idLoja].itens.findIndex(i => i.nome === nomeUpper);

        if (idxExistente >= 0) {
          const it = mapaLojas[idLoja].itens[idxExistente];
          if (!isFalta && !isBoleto && !it.isFalta && !it.isBoleto && !isBonif && !it.isBonif) {
             const novaQtd = Number(it.qtdEntregue) + Number(qtdDisplay);
             const novaBonif = Number(it.qtd_bonificada) + qtdBonificada;
             const novoTotalNum = it.valorNumerico + totalItem;
             
             it.qtdEntregue = novaQtd;
             it.qtdOriginal = Number(it.qtdOriginal) + Number(p.quantidade);
             it.qtd_bonificada = novaBonif;
             it.valorNumerico = novoTotalNum;
             it.totalDisplay = formatarMoeda(novoTotalNum);
             
             if(novaBonif > 0) {
                it.unitDisplay = `${novaBonif} = BONIFIC.`;
             }
          }
        } else {
          mapaLojas[idLoja].itens.push({
            id_pedido: p.id,
            nome: nomeUpper,
            unidade: p.unidade_medida || 'UN',
            qtdOriginal: p.quantidade,
            qtdEntregue: qtdDisplay,
            qtd_bonificada: qtdBonificada,
            unitDisplay: unitDisplay,
            totalDisplay: totalDisplay,
            valorNumerico: totalItem,
            isFalta: isFalta,
            isBoleto: isBoleto,
            precoOriginal: precoOriginal,
            isBonif: isBonif,
            isPendente: false,
            fornecedor_original: String(p.fornecedor_compra || '').replace('ALERTA|', '')
          });
        }

        if (!isFalta && !isBoleto && !isNaN(totalItem)) {
           mapaLojas[idLoja].totalFatura += totalItem;
        }

        if (p.nota_liberada === true) {
           mapaLojas[idLoja].liberadoCliente = true;
        }
      });

      const arrayLojas = Object.values(mapaLojas).sort((a, b) => a.loja_id - b.loja_id);
      arrayLojas.forEach(loja => loja.itens.sort((a, b) => a.nome.localeCompare(b.nome)));
      setFechamentos(arrayLojas);

      const arrayForn = Object.values(mapaForn).sort((a, b) => a.nome.localeCompare(b.nome));
      arrayForn.forEach(f => f.itens.sort((a, b) => a.nomeItem.localeCompare(b.nomeItem)));
      setFornecedores(arrayForn);

    } catch (err) { console.error(err); } finally { setCarregando(false); }
  }

  // 💡 FUNÇÃO PARA APLICAR VALOR MÉDIA (VENDA) SEM ALTERAR O FORNECEDOR
  const aplicarPrecoMedia = async () => {
    if(!itemMediaSelecionado || !valorMediaInput) return alert("Selecione o item e o valor.");
    
    let v = valorMediaInput.replace(/[^\d,.]/g, '');
    if(v.includes('.') && !v.includes(',')) v = v.replace('.', ',');
    v = v.replace(/[^\d,]/g, '');
    let num = parseFloat(v.replace(',', '.')) || 0;
    let finalStr = num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    setCarregando(true);
    try {
        // 💡 SALVA EXCLUSIVAMENTE NO PRECO_VENDA!
        const { error } = await supabase
            .from('pedidos')
            .update({ preco_venda: finalStr })
            .eq('data_pedido', dataFiltro)
            .eq('nome_produto', itemMediaSelecionado);
        
        if(error) throw error;
        alert(`Sucesso! O item ${itemMediaSelecionado} agora custa ${finalStr} para as lojas.`);
        setModalMediaAberto(false);
        setValorMediaInput('');
        carregar();
    } catch(e) {
        alert("Erro ao aplicar média: " + e.message);
        setCarregando(false);
    }
  };

  const abrirEdicao = (loja) => {
    setLojaEmEdicao(loja);
    const copiaItens = JSON.parse(JSON.stringify(loja.itens)).map(it => ({
       ...it,
       precoEditado: it.precoOriginal 
    }));
    setItensEditados(copiaItens);
    setBuscaEdicao(''); 
  };

  const handleChangeEdicao = (idPedido, campo, valor) => {
    setItensEditados(prev => prev.map(item => {
      if (item.id_pedido === idPedido) {
        const novoItem = { ...item, [campo]: valor };
        
        if (!novoItem.isFalta && !novoItem.isBoleto && !novoItem.isBonif && !novoItem.desfazerVoltar) {
           const q = parseFloat(novoItem.qtdEntregue) || 0;
           const b = parseFloat(novoItem.qtd_bonificada) || 0;
           const v = tratarPrecoNum(campo === 'precoEditado' ? valor : novoItem.precoEditado);
           
           const cobra = Math.max(0, q - b);
           const totalCalc = cobra * v;
           novoItem.totalDisplay = formatarMoeda(totalCalc);
           novoItem.valorNumerico = totalCalc;
           
           if(b > 0 && b < q) {
               novoItem.unitDisplay = `${b} = BONIFIC.`;
           } else {
               novoItem.unitDisplay = novoItem.precoEditado;
           }
        }
        return novoItem;
      }
      return item;
    }));
  };

  const handleBlurPreco = (idPedido, campo, valorAtual) => {
    if (!valorAtual || valorAtual === 'FALTA' || valorAtual === 'BOLETO' || String(valorAtual).includes('BONIFIC') || valorAtual === 'AGUARDANDO COMPRA') return;
    
    let v = String(valorAtual).replace(/[^\d,.]/g, '');
    if (!v.includes(',') && !v.includes('.')) { v = v + ',00'; }
    if(v.includes('.') && !v.includes(',')) v = v.replace('.', ',');
    v = v.replace(/[^\d,]/g, '');
    let num = parseFloat(v.replace(',', '.')) || 0;
    
    let finalStr = num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    handleChangeEdicao(idPedido, campo, finalStr);
  };

  const setStatusRapido = (idPedido, tipo) => {
    setItensEditados(prev => prev.map(item => {
      if (item.id_pedido === idPedido) {
        if (tipo === 'boleto') return { ...item, isBoleto: true, isFalta: false, isBonif: false, desfazerVoltar: false, unitDisplay: 'BOLETO', totalDisplay: 'BOLETO', valorNumerico: 0 };
        if (tipo === 'falta') return { ...item, isFalta: true, isBoleto: false, isBonif: false, desfazerVoltar: true, unitDisplay: 'FALTA', totalDisplay: 'FALTA', valorNumerico: 0 };
        if (tipo === 'normal') {
           const pb = item.precoOriginal && !item.precoOriginal.includes('BONIF') ? item.precoOriginal : '0,00';
           if (pb === '0,00' || pb === 'R$ 0,00') {
               return { ...item, isFalta: false, isBoleto: false, isBonif: false, desfazerVoltar: true, unitDisplay: 'R$ 0,00', precoEditado: 'R$ 0,00', totalDisplay: 'R$ 0,00', valorNumerico: 0, qtd_bonificada: 0 };
           }
           const b = Number(item.qtd_bonificada) || 0;
           const q = Number(item.qtdEntregue) || 0;
           const c = Math.max(0, q - b);
           const t = c * tratarPrecoNum(pb);
           
           let unitText = pb;
           if(b > 0) unitText = `${b} = BONIFIC.`;
           
           return { ...item, isFalta: false, isBoleto: false, isBonif: false, desfazerVoltar: false, unitDisplay: unitText, precoEditado: pb, totalDisplay: formatarMoeda(t), valorNumerico: t };
        }
      }
      return item;
    }));
  };

  const devolverParaPendenteDireto = async (item) => {
     if (item.isPendente) return alert("Este item já está aguardando compra.");
     if (!window.confirm(`Isso apagará o preço e devolverá "${item.nome}" para a aba de PENDENTES na Planilha de Compras. O fornecedor original será alertado. Deseja continuar?`)) return;
     
     setCarregando(true);
     await supabase.from('pedidos').update({
        status_compra: 'pendente',
        fornecedor_compra: `ALERTA|${item.fornecedor_original || ''}`, 
        custo_unit: '',
        qtd_atendida: 0,
        qtd_bonificada: 0,
        preco_venda: null 
     }).eq('id', item.id_pedido);
     
     setLojaEmEdicao(null);
     carregar();
  };

  const salvarEdicaoLoja = async () => {
    setCarregando(true);
    try {
      for (const item of itensEditados) {
        if (item.isPendente) continue;
        
        if (item.desfazerVoltar) {
            await supabase.from('pedidos').update({
              qtd_atendida: 0,
              qtd_bonificada: 0,
              custo_unit: '',
              fornecedor_compra: `ALERTA|${item.fornecedor_original || ''}`,
              status_compra: 'pendente',
              preco_venda: null
            }).eq('id', item.id_pedido);
            continue;
        }

        const statusFinal = item.isFalta ? 'falta' : item.isBoleto ? 'boleto' : 'atendido';
        
        // Mantém a regra do preco_venda caso altere algo específico na edição
        let unitParaBanco = item.precoEditado || item.precoOriginal;
        if(Number(item.qtd_bonificada) > 0) {
            unitParaBanco = `BONIFICAÇÃO | ${item.precoEditado}`;
        }

        const updatePayload = {
          qtd_atendida: Number(item.qtdEntregue) || 0,
          qtd_bonificada: Number(item.qtd_bonificada) || 0,
          preco_venda: unitParaBanco, 
          status_compra: statusFinal
        };
        await supabase.from('pedidos').update(updatePayload).eq('id', item.id_pedido);
      }
      setLojaEmEdicao(null);
      carregar(); 
    } catch(e) {
      alert("Erro ao salvar: " + e.message);
      setCarregando(false);
    }
  };

  const totalAoVivoEdicao = itensEditados.reduce((acc, item) => {
     if(item.isFalta || item.isBoleto || item.isPendente || (item.isBonif && String(item.unitDisplay).includes('BONIFIC')) || item.desfazerVoltar) return acc;
     const val = tratarPrecoNum(item.totalDisplay);
     return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const abrirPreviewImpressao = (tipo, loja = null) => {
    setTipoImpressao(tipo);
    setLojaParaImprimir(loja);
    setModoVisualizacaoImp(true);
  };

  const liberarParaOCliente = async (idLoja) => {
    const lojaObj = fechamentos.find(l => l.loja_id === idLoja);
    if (lojaObj && lojaObj.temPendencia) {
        alert('⚠️ Ação bloqueada! Esta loja possui itens com status PENDENTE.\nVá na Planilha de Compras e resolva antes de liberar para o cliente.');
        return;
    }
    if (!window.confirm("Isso vai disponibilizar esse fechamento no aplicativo do Gerente dessa loja. Confirmar?")) return;
    setCarregando(true);
    await supabase.from('pedidos').update({ nota_liberada: true }).eq('data_pedido', dataFiltro).eq('loja_id', idLoja);
    alert("✅ Fechamento liberado com sucesso para a loja!");
    carregar();
  };

  const alternarStatusPagamento = (nomeForn) => {
    setFornecedores(prev => prev.map(f => {
      if (f.nome === nomeForn) {
        return { ...f, statusPagamento: f.statusPagamento === 'pago' ? 'pendente' : 'pago' };
      }
      return f;
    }));
  };

  const copiarPixFornecedor = (chave, fNome) => {
    if (!chave || chave === 'Não cadastrada') return alert("Este fornecedor não possui PIX cadastrado.");
    navigator.clipboard.writeText(chave);
    alert(`PIX Copiado: ${chave}\nFornecedor: ${fNome}`);
  };

  const processarPDF = async (modo = 'baixar', lojaObj = null) => {
    const elemento = document.getElementById('area-impressao');
    if (!elemento) return;

    let nomeArquivo = `Fechamentos_${dataFechamentoBr.replace(/\//g, '-')}.pdf`;
    if (lojaObj) {
       nomeArquivo = `${lojaObj.nome_fantasia} - ${dataFechamentoBr.replace(/\//g, '-')}.pdf`;
    }

    const isMotorista = tipoImpressao?.startsWith('motorista');

    const opt = isMotorista ? {
      margin:       0, 
      filename:     nomeArquivo,
      image:        { type: 'jpeg', quality: 1 },
      html2canvas:  { scale: 1, useCORS: true, logging: false, windowWidth: 2480 },
      jsPDF:        { unit: 'px', format: [2480, 3508], orientation: 'portrait' }, 
      pagebreak:    { mode: ['css', 'legacy'] }
    } : {
      margin:       [10, 10, 15, 10], 
      filename:     nomeArquivo,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }, 
      pagebreak:    { mode: 'css', after: '.print-break' }
    };

    if (!window.html2pdf) {
      alert("Aguarde, carregando biblioteca PDF...");
      return;
    }

    if (modo === 'whatsapp') {
       try {
         const pdfBlob = await window.html2pdf().set(opt).from(elemento).output('blob');
         const file = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
         
         if (navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({
             files: [file],
             title: nomeArquivo,
             text: `Fechamento de Caixa - Entrega: ${dataFechamentoBr}`
           });
         } else {
           alert("Seu dispositivo não suporta compartilhamento direto. O arquivo será baixado para você enviar manualmente.");
           window.html2pdf().set(opt).from(elemento).save();
         }
       } catch (e) {
         console.error("Erro no Share API", e);
       }
    } else if (modo === 'preview') {
       const pdfBlobUrl = await window.html2pdf().set(opt).from(elemento).output('bloburl');
       window.open(pdfBlobUrl, '_blank');
    } else {
       window.html2pdf().set(opt).from(elemento).save();
    }
  };

  const fornecedoresExibidos = fornecedores.filter(f => {
    const isPago = f.statusPagamento === 'pago';
    const isBoletoOnly = f.totalPix === 0 && f.totalBoleto > 0;
    if (abaForn === 'pendentes') return !isPago && !isBoletoOnly;
    if (abaForn === 'finalizados') return isPago && !isBoletoOnly;
    if (abaForn === 'boletos') return isBoletoOnly;
    return true;
  });

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif', color: themeText }}>🔄 Processando...</div>;

  const renderTabelaDupla = (itensLoja, isMotorista) => {
    const half = Math.ceil(itensLoja.length / 2);
    const rows = [];
    for (let i = 0; i < half; i++) {
      rows.push({ left: itensLoja[i], right: itensLoja[i + half] });
    }

    const thStyleLoja = { border: '1px solid black', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', backgroundColor: '#e5e7eb', color: 'black' };
    const tdStyleLoja = { border: '1px solid black', padding: '6px 4px', textAlign: 'center', fontSize: '12px', fontWeight: '900', color: 'black' };
    const tdDescLoja = { ...tdStyleLoja, textAlign: 'left', fontSize: '13px', wordBreak: 'break-word' }; 

    const maxRows = Math.max(half, 20); 
    const availableHeight = 2500; 
    const calcFont = availableHeight / maxRows * 0.40;
    const fontSizeMot = Math.max(18, Math.min(38, calcFont)); 
    const paddingMot = Math.max(6, Math.min(12, calcFont * 0.15));

    const thStyleMot = { border: '4px solid black', padding: `${paddingMot}px 10px`, textAlign: 'center', fontWeight: 'bold', fontSize: `${fontSizeMot * 0.85}px`, backgroundColor: '#e5e7eb', color: 'black' };
    const tdStyleMot = { border: '4px solid black', padding: `${paddingMot}px 10px`, textAlign: 'center', fontSize: `${fontSizeMot}px`, fontWeight: '900', color: 'black' };
    const tdDescMot = { ...tdStyleMot, textAlign: 'left', fontSize: `${fontSizeMot + 2}px` };

    const thStyle = isMotorista ? thStyleMot : thStyleLoja;
    const tdStyle = isMotorista ? tdStyleMot : tdStyleLoja;
    const tdDesc = isMotorista ? tdDescMot : tdDescLoja;

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: isMotorista ? '20px' : '10px' }}>
        <thead>
          <tr>
            <th style={{...thStyle, width: '7%'}}>QUANT.</th>
            <th style={{...thStyle, width: '22%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '14%'}}>VAL. UNIT.</th>
            <th style={{...thStyle, width: '10%'}}>VAL. TOTAL.</th>
            <th style={{ border: 'none', width: '2%', backgroundColor: 'transparent' }}></th>
            <th style={{...thStyle, width: '7%'}}>QUANT.</th>
            <th style={{...thStyle, width: '22%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '14%'}}>VAL. UNIT.</th>
            <th style={{...thStyle, width: '10%'}}>VAL. TOTAL.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
             const renderCell = (item) => {
               if (!item) return <><td style={tdStyle}></td><td style={tdDesc}></td><td style={tdStyle}></td><td style={tdStyle}></td></>;
               
               let corUnit = 'black';
               let corTotal = 'black';
               let uDisp = item.unitDisplay;
               let tDisp = item.totalDisplay;

               if (item.isFalta) {
                  corUnit = '#ef4444'; corTotal = '#ef4444';
                  uDisp = 'FALTA'; tDisp = 'FALTA';
               } else if (item.isPendente) {
                  corUnit = '#f97316'; corTotal = '#f97316';
               } else if (item.isBoleto) {
                  corUnit = '#d97706'; corTotal = '#d97706';
                  uDisp = 'BOLETO'; tDisp = 'BOLETO';
               } else {
                  if (String(uDisp).includes('BONIFIC.')) corUnit = '#16a34a'; 
                  if (tDisp === 'BONIFIC.') corTotal = '#16a34a'; 
               }

               if (isMotorista) {
                  if (!item.isFalta) {
                     uDisp = '';
                     tDisp = '';
                  }
               } 

               return (
                 <>
                   <td style={tdStyle}>{item.qtdEntregue}</td>
                   <td style={tdDesc}>{formatarNomeItem(item.nome)}</td>
                   <td style={{...tdStyle, color: corUnit}}>{uDisp}</td>
                   <td style={{...tdStyle, color: corTotal}}>{tDisp}</td>
                 </>
               );
             };

             return (
               <tr key={idx}>
                 {renderCell(row.left)}
                 <td style={{ border: 'none', width: '2%' }}></td>
                 {renderCell(row.right)}
               </tr>
             )
          })}
        </tbody>
      </table>
    );
  };

  if (modoVisualizacaoImp) {
    const isMotGlobal = (tipoImpressao === 'motorista_todos');
    const isMotorista = tipoImpressao?.startsWith('motorista');
    const lojasParaRenderizar = isMotGlobal ? fechamentos : [lojaParaImprimir];
    
    const bloquearExportacao = isMotGlobal 
      ? fechamentos.some(l => l.temPendencia) 
      : lojaParaImprimir.temPendencia;

    return (
      <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
        
        <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', backgroundColor: themeCard, padding: '15px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
           
           {bloquearExportacao && (
             <div style={{ flex: '1 1 100%', background: '#fef2f2', color: '#ef4444', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', marginBottom: '5px' }}>
                ⚠️ RESOLVA AS PENDÊNCIAS NA PLANILHA DE COMPRAS PARA LIBERAR O DOWNLOAD E O COMPARTILHAMENTO.
             </div>
           )}

           <button onClick={() => setModoVisualizacaoImp(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬅ VOLTAR</button>
           
           <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
             <button onClick={() => processarPDF('preview', isMotGlobal ? null : lojaParaImprimir)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>👁️ VISUALIZAR PDF</button>

             {!bloquearExportacao && !isMotGlobal && (
               <button onClick={() => processarPDF('whatsapp', lojaParaImprimir)} style={{ background: '#25d366', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>🟢 COMPARTILHAR WHATSAPP</button>
             )}
             
             {!bloquearExportacao && (
               <button onClick={() => processarPDF('baixar', isMotGlobal ? null : lojaParaImprimir)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬇️ BAIXAR PDF</button>
             )}
           </div>
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
            <div id="area-impressao" className="print-section" style={{ backgroundColor: 'white', color: 'black', width: isMotorista ? '2480px' : '100%', maxWidth: isMotorista ? 'none' : '850px', margin: '0 auto' }}>
               
               {lojasParaRenderizar.map((loja, idx) => (
                  <div key={loja.loja_id} className="print-break" style={isMotorista ? { 
                      width: '2480px', 
                      height: '3450px', 
                      padding: '80px', 
                      boxSizing: 'border-box', 
                      display: 'flex', 
                      flexDirection: 'column',
                      backgroundColor: '#fff',
                      overflow: 'hidden',
                      pageBreakInside: 'avoid'
                  } : {
                      padding: '15px', position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column'
                  }}>
                      
                     <div style={isMotorista ? { border: '8px solid black', boxSizing: 'border-box', padding: '40px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' } : { border: '2px solid black', boxSizing: 'border-box', padding: '10px', height: '100%' }}>
                         
                         <div style={isMotorista ? { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '8px solid black', paddingBottom: '30px', marginBottom: '20px' } : { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '10px' }}>
                            {isMotorista ? (
                              <>
                                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <span style={{ fontWeight: '900', fontSize: '70px', color: 'black', textTransform: 'uppercase' }}>{loja.nome_fantasia}</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '45px', color: '#333', marginTop: '10px' }}>DATA: {dataFechamentoBr}</span>
                                </div>
                                <div style={{ flex: '1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <img src="/logoPDF.png" alt="Logo" style={{ maxHeight: '180px', objectFit: 'contain' }} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                    <span style={{ fontWeight: '900', fontSize: '18px', color: 'black', textTransform: 'uppercase' }}>{loja.nome_fantasia}</span>
                                </div>
                                <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src="/logoPDF.png" alt="Logo" style={{ maxHeight: '55px', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <span style={{ fontWeight: '900', fontSize: '20px', color: 'black' }}>TOTAL: {formatarMoeda(loja.totalFatura)}</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'black', marginTop: '2px' }}>DATA: {dataFechamentoBr}</span>
                                </div>
                              </>
                            )}
                         </div>

                         <div style={isMotorista ? { flex: 1, width: '100%', display: 'flex', flexDirection: 'column' } : {}}>
                            {renderTabelaDupla(loja.itens, isMotorista)}
                         </div>

                         {isMotorista && (
                            <div style={{ marginTop: 'auto', paddingTop: '80px', display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
                                <div style={{ textAlign: 'center', width: '40%' }}>
                                    <div style={{ borderBottom: '4px solid black', marginBottom: '15px', height: '50px' }}></div>
                                    <span style={{ fontSize: '40px', fontWeight: 'bold', color: 'black' }}>Assinatura Entregador</span>
                                </div>
                                <div style={{ textAlign: 'center', width: '40%' }}>
                                    <div style={{ borderBottom: '4px solid black', marginBottom: '15px', height: '50px' }}></div>
                                    <span style={{ fontSize: '40px', fontWeight: 'bold', color: 'black' }}>Assinatura Conferente (Loja)</span>
                                </div>
                            </div>
                         )}

                     </div>
                  </div>
               ))}
            </div>
        </div>

        <style>{`
          @media print {
            .no-print { display: none !important; }
            .print-break { 
               page-break-after: always !important; 
               ${isMotorista ? 'page-break-inside: avoid !important; break-inside: avoid !important;' : ''} 
               break-after: page !important; 
            }
            html, body { 
               ${isMotorista ? 'height: 100% !important; width: 100% !important; overflow: hidden !important;' : 'height: auto !important; overflow: visible !important;'} 
               background: white; margin: 0; padding: 0; 
            }
            #root, div { 
               ${isMotorista ? '' : 'overflow: visible !important; height: auto !important;'} 
            }
            .print-section { 
               ${isMotorista ? 'width: 2480px !important;' : 'min-width: 100% !important; max-width: 100% !important; width: 100% !important;'} 
               box-shadow: none !important; margin: 0 !important; padding: 0 !important; 
            }
            @page { 
               margin: ${isMotorista ? '0' : '10mm'}; 
               size: ${isMotorista ? '2480px 3508px' : 'portrait'}; 
            } 
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', paddingBottom: '100px', fontFamily: 'sans-serif', transition: '0.3s' }}>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: themeMenuTop, padding: '20px', borderRadius: '16px', color: '#fff', border: isEscuro ? '1px solid #334155' : 'none' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>🧮 GESTÃO DE FECHAMENTOS</h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>Pedidos de:</span>
            <input 
              type="date" 
              value={dataFiltro} 
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{ background: isEscuro ? '#334155' : '#e2e8f0', color: isEscuro ? '#fff' : '#111', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
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
          <p style={{ margin: '5px 0 0 0', color: '#22c55e', fontSize: '12px', fontWeight: 'bold' }}>
             Entrega nas lojas em: {dataFechamentoBr}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setModalMediaAberto(true)} style={{ backgroundColor: '#8b5cf6', color: '#fff', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                <span>📊</span> VALOR MÉDIA
            </button>

            {abaAtiva === 'lojas' && (
            <button onClick={() => abrirPreviewImpressao('motorista_todos')} style={{ backgroundColor: isEscuro ? '#334155' : '#fff', color: isEscuro ? '#f8fafc' : '#111', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', flex: '1 1 auto', justifyContent: 'center' }}>
                <span>🚚</span> VIAS MOTORISTAS PDF
            </button>
            )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', maxWidth: '1000px', margin: '0 auto 20px auto' }}>
        <button onClick={() => setAbaAtiva('lojas')} style={{ flex: 1, minWidth: '150px', padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'lojas' ? '#3b82f6' : themeCard, color: abaAtiva === 'lojas' ? '#fff' : themeText, boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏪 NOTAS DAS LOJAS
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, minWidth: '150px', padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#f97316' : themeCard, color: abaAtiva === 'fornecedores' ? '#fff' : themeText, boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏢 PAGAR FORNECEDORES
        </button>
      </div>

      {abaAtiva === 'lojas' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {fechamentos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', backgroundColor: themeCard, padding: '40px', borderRadius: '16px' }}>Nenhum fechamento de loja disponível para esta data.</p>
          ) : (
            fechamentos.map((loja) => (
              <div key={loja.loja_id} style={{ backgroundColor: themeCard, borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', marginBottom: '20px', border: `1px solid ${themeBorder}`, overflow: 'hidden' }}>
                
                <div onClick={() => setLojaExpandida(lojaExpandida === loja.loja_id ? null : loja.loja_id)} style={{ padding: '20px', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', backgroundColor: lojaExpandida === loja.loja_id ? (isEscuro ? '#0f172a' : '#f8fafc') : themeCard, transition: '0.2s' }}>
                  <div style={{ flex: '1 1 auto' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', color: themeText }}>
                       {loja.nome_fantasia} {loja.temPendencia && <span style={{color: '#ef4444', fontSize: '14px'}}>⚠️ PENDÊNCIAS</span>}
                    </h1>
                    <span style={{ color: loja.liberadoCliente ? '#22c55e' : '#f59e0b', fontSize: '10px', fontWeight: 'bold', display: 'inline-block', marginTop: '5px', padding: '4px 8px', borderRadius: '6px', backgroundColor: loja.liberadoCliente ? (isEscuro ? '#166534' : '#dcfce7') : (isEscuro ? '#78350f' : '#fef3c7') }}>
                      {loja.liberadoCliente ? '✅ LIBERADO' : '⏳ AGUARDANDO'}
                    </span>
                  </div>
                  
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '15px' }}>
                     <div>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>TOTAL DA NOTA</span>
                        <span style={{ fontSize: '22px', fontWeight: '900', color: themeText }}>{formatarMoeda(loja.totalFatura)}</span>
                     </div>
                     <span style={{ fontSize: '18px', color: '#64748b', transform: lojaExpandida === loja.loja_id ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>▼</span>
                  </div>
                </div>

                {lojaExpandida === loja.loja_id && (
                  <div style={{ padding: '20px', borderTop: `2px solid ${themeBorder}` }}>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '25px', justifyContent: 'flex-end' }}>
                      <button onClick={() => abrirEdicao(loja)} style={{ background: isEscuro ? '#334155' : '#111', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>✏️ EDITAR</button>
                      <button onClick={() => abrirPreviewImpressao('loja_unica', loja)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>📄 VISUALIZAR VIA</button>
                      <button onClick={() => abrirPreviewImpressao('motorista_loja', loja)} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>🚚 VIA MOTORISTA</button>
                      {!loja.liberadoCliente && (
                        <button onClick={() => liberarParaOCliente(loja.loja_id)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>📤 LIBERAR CLIENTE</button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', fontSize: '12px' }}>
                      {loja.itens.map((item, i) => {
                         const unitF = item.unitDisplay;
                         const totF = item.totalDisplay;
                         const isRed = item.isFalta;
                         const isOrange = item.isBoleto;
                         const isGreen = item.isBonif || String(unitF).includes('BONIFIC');
                         const isPendente = item.isPendente;

                         return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: `1px dashed ${themeBorder}`, backgroundColor: isPendente ? (isEscuro ? '#451a03' : '#fff7ed') : (isEscuro ? '#0f172a' : '#f8fafc'), borderRadius: '8px', border: isPendente ? '1px solid #f97316' : 'none' }}>
                              <div style={{ flex: 1, paddingRight: '10px' }}>
                                <span style={{ fontWeight: 'bold', color: themeText }}>
                                  {item.qtdEntregue}x {formatarNomeItem(item.nome)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', whiteSpace: 'nowrap' }}>
                                {!isPendente && (
                                   <button onClick={() => devolverParaPendenteDireto(item)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer' }} title="Desfazer e jogar para pendentes">🔙</button>
                                )}
                                
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ color: isPendente ? '#f97316' : (isOrange ? '#d97706' : isRed ? '#ef4444' : isGreen ? '#16a34a' : '#94a3b8'), marginRight: '5px', fontWeight: 'bold' }}>{unitF}</span>
                                  <strong style={{ fontWeight: '900', color: isPendente ? '#f97316' : (isOrange ? '#d97706' : isRed ? '#ef4444' : (totF === 'BONIFIC.' ? '#16a34a' : themeText)) }}>{totF}</strong>
                                </div>
                              </div>
                            </div>
                         )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {abaAtiva === 'fornecedores' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => setAbaForn('pendentes')} style={{ flex: '1 1 auto', padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', background: abaForn === 'pendentes' ? '#fcd34d' : themeCard, color: abaForn === 'pendentes' ? '#b45309' : '#64748b' }}>PENDENTES (PIX)</button>
            <button onClick={() => setAbaForn('finalizados')} style={{ flex: '1 1 auto', padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', background: abaForn === 'finalizados' ? '#22c55e' : themeCard, color: abaForn === 'finalizados' ? '#fff' : '#64748b' }}>FINALIZADOS</button>
            <button onClick={() => setAbaForn('boletos')} style={{ flex: '1 1 auto', padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', background: abaForn === 'boletos' ? '#3b82f6' : themeCard, color: abaForn === 'boletos' ? '#fff' : '#64748b' }}>BOLETOS</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {fornecedoresExibidos.length === 0 ? (
              <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#666', backgroundColor: themeCard, padding: '40px', borderRadius: '16px' }}>Nenhum fornecedor nesta categoria para este dia.</p>
            ) : (
              fornecedoresExibidos.map((forn, idx) => {
                const isPago = forn.statusPagamento === 'pago';
                const isBoletoOnly = forn.totalPix === 0 && forn.totalBoleto > 0;
                
                let corBorda = '#fcd34d'; 
                let corFundo = isEscuro ? '#451a03' : '#fffbeb';
                let corTexto = isEscuro ? '#fcd34d' : '#b45309';
                let tagStatus = 'PENDENTE';

                if (forn.precisaRefazer) {
                    corBorda = '#ef4444';
                    corFundo = isEscuro ? '#450a0a' : '#fef2f2';
                    corTexto = '#ef4444';
                    tagStatus = '⚠️ PEDIDO ALTERADO';
                } else if (isPago) {
                  corBorda = '#22c55e'; 
                  corFundo = isEscuro ? '#14532d' : '#dcfce7';
                  corTexto = isEscuro ? '#86efac' : '#166534';
                  tagStatus = 'PAGO ✅';
                } else if (isBoletoOnly) {
                  corBorda = '#60a5fa'; 
                  corFundo = isEscuro ? '#1e3a8a' : '#eff6ff';
                  corTexto = isEscuro ? '#93c5fd' : '#1d4ed8';
                  tagStatus = 'BOLETO 📄';
                }

                const expandido = fornExpandido === forn.nome;

                return (
                  <div key={idx} style={{ backgroundColor: themeCard, borderRadius: '16px', border: `2px solid ${corBorda}`, overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', opacity: isPago ? 0.9 : 1, transition: '0.3s' }}>
                    
                    <div onClick={() => setFornExpandido(expandido ? null : forn.nome)} style={{ padding: '15px', backgroundColor: corFundo, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '13px', color: corTexto, textTransform: 'uppercase', fontWeight: '900' }}>{forn.nome}</h3>
                        <span style={{ fontSize: '9px', fontWeight: '900', color: corTexto, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.2)' }}>{tagStatus}</span>
                      </div>
                      
                      <div style={{ fontSize: '20px', fontWeight: '900', color: corTexto }}>
                         {forn.precisaRefazer ? 'ALERTA!' : (isBoletoOnly && !expandido ? 'BOLETO' : formatarMoeda(forn.totalPix + forn.totalBoleto))}
                      </div>
                    </div>

                    {expandido && (
                      <div style={{ padding: '15px' }}>
                        
                        {!isBoletoOnly && !forn.precisaRefazer && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', border: `1px dashed ${themeBorder}`, padding: '12px', borderRadius: '8px', marginBottom: '15px' }}>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                 <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>Chave PIX:</span>
                                 <strong style={{ fontSize: '12px', color: themeText }}>{forn.chavePix || 'Não cadastrada'}</strong>
                              </div>
                              {forn.chavePix && forn.chavePix !== 'Não cadastrada' && (
                                 <button onClick={() => copiarPixFornecedor(forn.chavePix, forn.nome)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>COPIAR PIX</button>
                              )}
                            </div>

                            {forn.telefone && (
                              <div>
                                 <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>Telefone:</span>
                                 <strong style={{ fontSize: '12px', color: themeText }}>{forn.telefone}</strong>
                              </div>
                            )}

                            {forn.nomeCadastrado && forn.nomeCadastrado.toUpperCase() !== forn.nome.toUpperCase() && (
                              <div style={{ paddingTop: '5px', borderTop: `1px solid ${themeBorder}` }}>
                                 <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>Nome no Cadastro Oficial:</span>
                                 <strong style={{ fontSize: '11px', color: themeText }}>{forn.nomeCadastrado}</strong>
                              </div>
                            )}

                          </div>
                        )}

                        <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {forn.itens.map((i, k) => {
                             const qtdCobrada = i.qtd - i.qtdBonificada;
                             if (qtdCobrada > 0) {
                               return (
                                 <div key={`norm_${k}`} style={{ fontSize: '11px', color: themeText, fontWeight: 'bold' }}>
                                   {qtdCobrada} - {formatarNomeItem(i.nomeItem)} - {i.valUnit} = {formatarMoeda(i.totalCobrado)} <span style={{color: '#d97706', fontWeight: '900'}}>{i.isBoleto && '(BOLETO)'}</span>
                                 </div>
                               );
                             }
                             return null;
                          })}
                        </div>

                        {forn.totalDescontoBonif > 0 && (
                          <div style={{ borderTop: `1px dashed ${themeBorder}`, paddingTop: '10px', marginTop: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '900', color: '#16a34a', marginBottom: '5px' }}>Bonificações:</div>
                            <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {forn.itens.filter(i => i.qtdBonificada > 0).map((i, k) => {
                                 const basePriceNum = tratarPrecoNum(i.valUnit);
                                 const valBonif = basePriceNum * i.qtdBonificada;
                                 return (
                                   <div key={`bonif_${k}`} style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>
                                     {i.qtdBonificada} - {formatarNomeItem(i.nomeItem)} - {formatarMoeda(valBonif)}
                                   </div>
                                 );
                              })}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', fontWeight: 'bold' }}>
                               Valor bruto = {formatarMoeda(forn.totalBruto)}
                            </div>
                          </div>
                        )}

                        <div style={{ fontSize: '14px', fontWeight: '900', color: themeText, marginTop: '10px', borderTop: `1px solid ${themeBorder}`, paddingTop: '10px' }}>
                            Total a pagar = {formatarMoeda(forn.totalPix + forn.totalBoleto)}
                        </div>

                        {!isBoletoOnly && !forn.precisaRefazer && (
                          <button onClick={() => alternarStatusPagamento(forn.nome)} style={{ width: '100%', marginTop: '15px', padding: '12px', backgroundColor: isPago ? (isEscuro ? '#1e293b' : '#f1f5f9') : '#22c55e', color: isPago ? '#64748b' : '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
                            {isPago ? 'DESFAZER PAGAMENTO' : 'PIX FEITO / CONCLUIR'}
                          </button>
                        )}
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 💡 MODAL DE EDIÇÃO DA LOJA */}
      {lojaEmEdicao && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
          <div style={{ backgroundColor: themeCard, width: '100%', maxWidth: '800px', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '95vh' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: themeText }}>✏️ EDITAR NOTA</h3>
                <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '12px' }}>{lojaEmEdicao.nome_fantasia}</span>
              </div>
              <button onClick={() => setLojaEmEdicao(null)} style={{ background: isEscuro ? '#334155' : '#f1f5f9', color: themeText, border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <input 
                 type="text" 
                 placeholder="Buscar produto para editar..." 
                 value={buscaEdicao}
                 onChange={(e) => setBuscaEdicao(e.target.value)}
                 style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${themeBorder}`, backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', color: themeText, outline: 'none' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
              {itensEditados.filter(i => i.nome.toLowerCase().includes(buscaEdicao.toLowerCase())).map((item) => {
                const corInputValores = item.isFalta ? '#ef4444' : item.isBoleto ? '#d97706' : item.isBonif ? '#16a34a' : themeText;

                return (
                  <div key={item.id_pedido} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', padding: '15px', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', marginBottom: '10px', borderRadius: '12px', border: `1px solid ${themeBorder}` }}>
                    
                    <div style={{ flex: '1 1 100%' }}>
                      <strong style={{ fontSize: '13px', display: 'block', lineHeight: '1.2', color: themeText }}>
                        {formatarNomeItem(item.nome)}
                      </strong>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                        
                        <button onClick={() => setStatusRapido(item.id_pedido, 'boleto')} style={{ fontSize: '10px', background: item.isBoleto ? '#d97706' : (isEscuro ? '#451a03' : '#fef3c7'), color: item.isBoleto ? '#fff' : '#d97706', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>BOLETO</button>
                        
                        <button onClick={() => setStatusRapido(item.id_pedido, 'falta')} style={{ fontSize: '10px', background: item.isFalta ? '#ef4444' : (isEscuro ? '#450a0a' : '#fef2f2'), color: item.isFalta ? '#fff' : '#ef4444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>FALTA</button>
                        
                        {(item.isFalta || item.isBoleto || item.isBonif || item.precoEditado !== item.precoOriginal) && (
                          <button onClick={() => setStatusRapido(item.id_pedido, 'normal')} style={{ fontSize: '10px', background: isEscuro ? '#334155' : '#e2e8f0', color: themeText, border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>🔙 DESFAZER</button>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: '1 1 20%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>QTD</label>
                      <input type="number" value={item.qtdEntregue} onChange={e => handleChangeEdicao(item.id_pedido, 'qtdEntregue', e.target.value)} disabled={item.isFalta} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeBorder}`, outline: 'none', textAlign: 'center', fontWeight: 'bold', color: themeText, background: isEscuro ? '#1e293b' : '#fff' }} />
                    </div>

                    <div style={{ flex: '1 1 20%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#16a34a', display: 'block' }}>🎁 BONIF</label>
                      <input type="number" value={item.qtd_bonificada} onChange={e => handleChangeEdicao(item.id_pedido, 'qtd_bonificada', e.target.value)} disabled={item.isFalta} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid #22c55e`, outline: 'none', textAlign: 'center', fontWeight: 'bold', color: '#16a34a', background: isEscuro ? '#14532d' : '#dcfce7' }} />
                    </div>

                    <div style={{ flex: '1 1 25%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>V. UNIT</label>
                      <input type="text" value={item.precoEditado || ''} onChange={e => handleChangeEdicao(item.id_pedido, 'precoEditado', e.target.value)} onBlur={e => handleBlurPreco(item.id_pedido, 'precoEditado', e.target.value)} disabled={item.isFalta || item.isBoleto || item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeBorder}`, outline: 'none', fontWeight: 'bold', color: corInputValores, background: isEscuro ? '#1e293b' : '#fff' }} />
                    </div>

                    <div style={{ flex: '1 1 25%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>TOTAL</label>
                      <input type="text" value={item.totalDisplay} disabled={true} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeBorder}`, outline: 'none', fontWeight: 'bold', color: corInputValores, background: isEscuro ? '#334155' : '#e2e8f0', cursor: 'not-allowed' }} />
                    </div>

                  </div>
                )
              })}
            </div>

            <button onClick={salvarEdicaoLoja} style={{ width: '100%', padding: '15px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '14px', marginTop: '15px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
              💾 SALVAR - TOTAL: {formatarMoeda(totalAoVivoEdicao)}
            </button>
          </div>
        </div>
      )}

      {/* 💡 MODAL DE VALOR MÉDIA */}
      {modalMediaAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 11000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: themeCard, width: '100%', maxWidth: '400px', borderRadius: '16px', padding: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: themeText, textAlign: 'center' }}>📊 Aplicar Valor Média</h3>
            
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>ESCOLHA O ITEM:</label>
            <select 
                value={itemMediaSelecionado} 
                onChange={(e) => setItemMediaSelecionado(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '20px', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', color: themeText, border: `1px solid ${themeBorder}` }}
            >
                <option value="">Selecione um produto...</option>
                {[...new Set(fechamentos.flatMap(l => l.itens.map(i => i.nome)))].sort().map(nome => (
                    <option key={nome} value={nome}>{nome}</option>
                ))}
            </select>

            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>NOVO PREÇO PARA LOJAS (R$):</label>
            <input 
                type="text"
                placeholder="Ex: 5,50"
                value={valorMediaInput}
                onChange={(e) => setValorMediaInput(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '25px', backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', color: themeText, border: `1px solid ${themeBorder}`, fontSize: '18px', fontWeight: 'bold', textAlign: 'center' }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setModalMediaAberto(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>CANCELAR</button>
                <button onClick={aplicarPrecoMedia} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>APLICAR MÉDIA</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
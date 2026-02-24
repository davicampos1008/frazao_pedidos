import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FechamentoLojas({ isEscuro }) {
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

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

  const [lojaGeralSelecionada, setLojaGeralSelecionada] = useState({});
  const [localCompra, setLocalCompra] = useState('ceasa'); 
  const [copiadoGeral, setCopiadoGeral] = useState(null);

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

  const extrairNum = (valor) => {
    const num = String(valor || "").match(/\d+/);
    return num ? parseInt(num[0], 10) : null;
  };

  const tratarPrecoNum = (p) => {
    if (!p || typeof p !== 'string') return 0;
    const strClean = String(p).replace('R$ ', '').replace(/\./g, '').replace(',', '.');
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
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje);
      const { data: fornData } = await supabase.from('fornecedores').select('*'); 
      
      if (fornData) setFornecedoresBd(fornData);

      const mapaLojas = {};
      const mapaForn = {};

      (pedData || []).forEach(p => {
        // 💡 IGNORA ITEMS QUE JÁ FORAM DEVOLVIDOS PRO PENDENTE PARA NÃO SOMAR NOS FORNECEDORES
        if (p.status_compra === 'pendente') {
            // Apenas registra na loja como pendente para bloquear o PDF. Não vai pro fornecedor.
            const idLoja = extrairNum(p.loja_id);
            if (!idLoja || idLoja <= 1) return;
            if (!mapaLojas[idLoja]) {
              const lInfo = lojasData.find(l => extrairNum(l.codigo_loja) === idLoja);
              mapaLojas[idLoja] = { loja_id: idLoja, nome_fantasia: lInfo ? lInfo.nome_fantasia : `Loja ${idLoja}`, itens: [], totalFatura: 0, liberadoCliente: false, temPendencia: true };
            }
            
            mapaLojas[idLoja].itens.push({
                id_pedido: p.id,
                nome: p.nome_produto.toUpperCase(),
                unidade: p.unidade_medida || 'UN',
                qtdOriginal: p.quantidade,
                qtdEntregue: p.quantidade,
                unitDisplay: 'AGUARDANDO COMPRA',
                totalDisplay: 'PENDENTE',
                valorNumerico: 0,
                isFalta: false,
                isBoleto: false,
                precoOriginal: '0,00',
                isBonif: false,
                isPendente: true, // 💡 Flag vital
                fornecedor_original: p.fornecedor_compra
            });
            mapaLojas[idLoja].temPendencia = true;
            return;
        }

        // --- FORNECEDORES ---
        if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          const fNome = p.fornecedor_compra ? p.fornecedor_compra.toUpperCase() : 'SEM FORNECEDOR';
          const isBoleto = p.status_compra === 'boleto';
          
          let baseVal = p.custo_unit;
          let qtdBonifFornecedor = 0;
          
          if (String(p.custo_unit).includes('BONIFICAÇÃO |')) {
             const partes = p.custo_unit.split('|');
             qtdBonifFornecedor = parseInt(partes[0]) || 0;
             baseVal = partes[1].trim();
          }

          const valNum = tratarPrecoNum(baseVal);
          const qtdCobradaForn = Math.max(0, p.qtd_atendida - qtdBonifFornecedor);
          const totalItemFornCobrado = qtdCobradaForn * valNum;
          const valorEconomizadoBonif = qtdBonifFornecedor * valNum;

          if (!mapaForn[fNome]) {
            const fInfo = (fornData || []).find(f => f.nome_fantasia.toUpperCase() === fNome);
            mapaForn[fNome] = { 
               nome: fNome, 
               chavePix: fInfo ? fInfo.chave_pix : 'Não cadastrada', 
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

          const itemExistenteIndex = mapaForn[fNome].itens.findIndex(i => i.nomeItem === p.nome_produto && i.isBoleto === isBoleto && i.valUnit === baseVal);

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
                valUnit: baseVal, 
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

        // --- LOJAS (Itens Atendidos/Falta) ---
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
        let unitDisplay = p.custo_unit || 'R$ 0,00';
        let totalItem = 0;
        let totalDisplay = '';
        let precoOriginal = p.custo_unit || 'R$ 0,00';
        let isBonif = false;

        if (isFalta) {
          unitDisplay = 'FALTA';
          totalDisplay = 'FALTA';
        } else if (p.custo_unit === 'BONIFICAÇÃO') {
          isBonif = true;
          unitDisplay = 'BONIFIC.';
          totalDisplay = 'BONIFIC.';
          totalItem = 0;
          qtdDisplay = p.qtd_atendida;
        } else if (String(p.custo_unit).includes('BONIFICAÇÃO |')) {
          isBonif = true;
          const parts = p.custo_unit.split('|');
          precoOriginal = parts[1] ? parts[1].trim() : 'R$ 0,00';
          const pUnit = tratarPrecoNum(precoOriginal);
          const qtdBonificadaLoja = parseInt(parts[0]) || 0;
          qtdDisplay = p.qtd_atendida;
          
          const restCobrado = qtdDisplay - qtdBonificadaLoja;
          totalItem = restCobrado > 0 ? restCobrado * pUnit : 0;
          totalDisplay = formatarMoeda(totalItem);

          if (qtdBonificadaLoja >= qtdDisplay) {
              unitDisplay = 'BONIFIC.';
              totalDisplay = 'BONIFIC.';
          } else if (isBoleto) {
              unitDisplay = `${qtdBonificadaLoja} = BONIFIC.`;
              totalDisplay = 'BOLETO';
          } else {
              unitDisplay = `${qtdBonificadaLoja} = BONIFIC.`;
          }

        } else if (isBoleto) {
          unitDisplay = 'BOLETO';
          totalDisplay = 'BOLETO';
        } else {
          qtdDisplay = p.qtd_atendida; 
          const valNum = tratarPrecoNum(p.custo_unit);
          totalItem = p.qtd_atendida * valNum;
          totalDisplay = formatarMoeda(totalItem); 
        }

        const nomeUpper = p.nome_produto.toUpperCase();
        const idxExistente = mapaLojas[idLoja].itens.findIndex(i => i.nome === nomeUpper);

        if (idxExistente >= 0) {
          const it = mapaLojas[idLoja].itens[idxExistente];
          if (!isFalta && !isBoleto && !it.isFalta && !it.isBoleto && !isBonif && !it.isBonif) {
             const novaQtd = Number(it.qtdEntregue) + Number(qtdDisplay);
             const novoTotalNum = it.valorNumerico + totalItem;
             it.qtdEntregue = novaQtd;
             it.qtdOriginal = Number(it.qtdOriginal) + Number(p.quantidade);
             it.valorNumerico = novoTotalNum;
             it.totalDisplay = formatarMoeda(novoTotalNum);
          }
        } else {
          mapaLojas[idLoja].itens.push({
            id_pedido: p.id,
            nome: nomeUpper,
            unidade: p.unidade_medida || 'UN',
            qtdOriginal: p.quantidade,
            qtdEntregue: qtdDisplay,
            unitDisplay: unitDisplay,
            totalDisplay: totalDisplay,
            valorNumerico: totalItem,
            isFalta: isFalta,
            isBoleto: isBoleto,
            precoOriginal: precoOriginal,
            isBonif: isBonif,
            isPendente: false
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

  useEffect(() => { carregar(); }, []);

  const abrirEdicao = (loja) => {
    setLojaEmEdicao(loja);
    setItensEditados(JSON.parse(JSON.stringify(loja.itens)));
    setBuscaEdicao(''); 
  };

  const handleChangeEdicao = (idPedido, campo, valor) => {
    setItensEditados(prev => prev.map(item => {
      if (item.id_pedido === idPedido) {
        const novoItem = { ...item, [campo]: valor };
        if (!novoItem.isFalta && !novoItem.isBoleto && !novoItem.isBonif && !novoItem.desfazerVoltar) {
           const q = parseFloat(novoItem.qtdEntregue) || 0;
           const v = tratarPrecoNum(novoItem.unitDisplay);
           const totalCalc = q * v;
           novoItem.totalDisplay = formatarMoeda(totalCalc);
           novoItem.valorNumerico = totalCalc;
        }
        return novoItem;
      }
      return item;
    }));
  };

  const handleBlurPreco = (idPedido, campo, valorAtual) => {
    if (!valorAtual || valorAtual === 'FALTA' || valorAtual === 'BOLETO' || valorAtual.includes('BONIFIC') || valorAtual === 'AGUARDANDO COMPRA') return;
    let v = String(valorAtual).replace(/[^\d,.]/g, '');
    if (!v.includes(',') && !v.includes('.')) { v = v + ',00'; }
    if(v.includes('.') && !v.includes(',')) v = v.replace('.', ',');
    v = v.replace(/[^\d,]/g, '');
    let num = parseFloat(v.replace(',', '.')) || 0;
    let finalStr = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    handleChangeEdicao(idPedido, campo, finalStr);
  };

  // 💡 BOTÃO DE DESFAZER DIRETO NA LINHA! (Joga pra aba de Pendentes automaticamente)
  const devolverParaPendenteDireto = async (item) => {
     if (item.isPendente) return alert("Este item já está aguardando compra.");
     if (!window.confirm(`Isso apagará o preço e devolverá "${item.nome}" para a aba de PENDENTES na Planilha de Compras. O fornecedor original será alertado. Deseja continuar?`)) return;
     
     setCarregando(true);
     await supabase.from('pedidos').update({
        status_compra: 'pendente',
        fornecedor_compra: `ALERTA|${item.fornecedor_original || ''}`, // 💡 Salva o prefixo pro Fornecedor ficar vermelho
        custo_unit: '',
        qtd_atendida: 0
     }).eq('id', item.id_pedido);
     
     setLojaEmEdicao(null);
     carregar();
  };

  const salvarEdicaoLoja = async () => {
    setCarregando(true);
    try {
      for (const item of itensEditados) {
        if (item.isPendente) continue; // Não edita itens que ainda estão pendentes
        
        const statusFinal = item.isFalta ? 'falta' : item.isBoleto ? 'boleto' : 'atendido';
        const updatePayload = {
          qtd_atendida: Number(item.qtdEntregue) || 0,
          custo_unit: item.unitDisplay, 
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
     if(item.isFalta || item.isBoleto || item.isPendente || (item.isBonif && item.unitDisplay.includes('BONIFIC'))) return acc;
     const val = tratarPrecoNum(item.totalDisplay);
     return acc + (isNaN(val) ? 0 : val);
  }, 0);

  // 💡 TRAVA DO PDF CASO EXISTA PENDÊNCIA
  const abrirPreviewImpressao = (tipo, loja = null) => {
    if (loja && loja.temPendencia) {
        alert('⚠️ Ação bloqueada! Esta loja possui itens com status PENDENTE.\nVá na Planilha de Compras e resolva o fornecedor/falta antes de fechar a nota.');
        return;
    }
    if (tipo === 'motorista_todos') {
        const lojasPendentes = fechamentos.filter(l => l.temPendencia);
        if (lojasPendentes.length > 0) {
            alert('⚠️ Ação bloqueada! Algumas lojas possuem itens PENDENTES.\nResolva todas as compras pendentes do dia na Planilha antes de gerar o bloco dos motoristas.');
            return;
        }
    }

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
    await supabase.from('pedidos').update({ nota_liberada: true }).eq('data_pedido', hoje).eq('loja_id', idLoja);
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
    navigator.clipboard.writeText(chave);
    alert(`PIX Copiado: ${chave}\nFornecedor: ${fNome}`);
  };

  const processarPDF = async (modo = 'baixar', lojaObj = null) => {
    const elemento = document.getElementById('area-impressao');
    if (!elemento) return;

    let nomeArquivo = `Fechamentos_${dataBr.replace(/\//g, '-')}.pdf`;
    if (lojaObj) {
       nomeArquivo = `${lojaObj.nome_fantasia} - ${dataBr.replace(/\//g, '-')}.pdf`;
    }

    const opt = {
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
             text: 'Fechamento de Caixa'
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

    const thStyle = { border: '1px solid black', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', backgroundColor: '#e5e7eb', color: 'black' };
    const tdStyle = { border: '1px solid black', padding: '6px 4px', textAlign: 'center', fontSize: '12px', fontWeight: '900', color: 'black' };
    const tdDesc = { ...tdStyle, textAlign: 'left', fontSize: '13px', fontWeight: '900', color: 'black', wordBreak: 'break-word' }; 

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
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
                  corUnit = '#ef4444'; 
                  corTotal = '#ef4444';
                  uDisp = 'FALTA';
                  tDisp = 'FALTA';
               } else if (item.isPendente) {
                  corUnit = '#f97316'; 
                  corTotal = '#f97316';
               } else {
                  if (uDisp.includes('BONIFIC.')) corUnit = '#16a34a'; 
                  else if (uDisp === 'BOLETO') corUnit = '#d97706'; 
                  
                  if (tDisp === 'BONIFIC.') corTotal = '#16a34a'; 
                  else if (tDisp === 'BOLETO') corTotal = '#d97706'; 
               }

               if (isMotorista && !item.isFalta && !item.isPendente) {
                  uDisp = '';
                  tDisp = '';
               } 

               return (
                 <>
                   <td style={tdStyle}>{item.qtdEntregue}</td>
                   <td style={tdDesc}>{formatarNomeItem(item.nome)}</td>
                   <td style={{...tdStyle, fontSize: '11px', color: corUnit, fontWeight: '900'}}>{uDisp}</td>
                   <td style={{...tdStyle, fontSize: '11px', color: corTotal, fontWeight: '900'}}>{tDisp}</td>
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
    const lojasParaRenderizar = isMotGlobal ? fechamentos : [lojaParaImprimir];

    return (
      <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
        
        <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', backgroundColor: themeCard, padding: '15px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
           <button onClick={() => setModoVisualizacaoImp(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬅ VOLTAR</button>
           
           <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
             <button onClick={() => processarPDF('preview', isMotGlobal ? null : lojaParaImprimir)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>👁️ VISUALIZAR PDF</button>

             {!isMotGlobal && (
               <button onClick={() => processarPDF('whatsapp', lojaParaImprimir)} style={{ background: '#25d366', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>🟢 COMPARTILHAR WHATSAPP</button>
             )}
             
             <button onClick={() => processarPDF('baixar', isMotGlobal ? null : lojaParaImprimir)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬇️ BAIXAR PDF</button>
           </div>
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
            <div id="area-impressao" className="print-section" style={{ backgroundColor: 'white', color: 'black', width: '100%', maxWidth: '850px', margin: '0 auto' }}>
               
               {lojasParaRenderizar.map((loja, idx) => (
                  <div key={loja.loja_id} className="print-break" style={{ padding: '15px', position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                     
                     <div style={{ border: '2px solid black', boxSizing: 'border-box', padding: '10px', height: '100%' }}>
                         
                         <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '10px' }}>
                            
                            {isMotGlobal ? (
                              <>
                                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <span style={{ fontWeight: '900', fontSize: '18px', color: 'black', textTransform: 'uppercase' }}>{loja.nome_fantasia}</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'black', marginTop: '4px' }}>DATA: {dataBr}</span>
                                </div>
                                <div style={{ flex: '1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <img src="/logoPDF.png" alt="Logo" style={{ maxHeight: '60px', objectFit: 'contain' }} />
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
                                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'black', marginTop: '2px' }}>DATA: {dataBr}</span>
                                </div>
                              </>
                            )}
                         </div>

                         {renderTabelaDupla(loja.itens, isMotGlobal)}

                     </div>
                  </div>
               ))}
            </div>
        </div>

        <style>{`
          @media print {
            .no-print { display: none !important; }
            .print-break { page-break-after: always !important; break-after: page !important; }
            html, body { height: auto !important; overflow: visible !important; background: white; margin: 0; padding: 0; }
            #root, div { overflow: visible !important; height: auto !important; }
            .print-section { box-shadow: none !important; min-width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
            @page { margin: 10mm; size: portrait; } 
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
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>{dataBr}</p>
        </div>
        
        {abaAtiva === 'lojas' && (
          <button onClick={() => abrirPreviewImpressao('motorista_todos')} style={{ backgroundColor: isEscuro ? '#334155' : '#fff', color: isEscuro ? '#f8fafc' : '#111', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', flex: '1 1 auto', justifyContent: 'center' }}>
            <span>🚚</span> VIAS MOTORISTAS PDF
          </button>
        )}
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
            <p style={{ textAlign: 'center', color: '#666', backgroundColor: themeCard, padding: '40px', borderRadius: '16px' }}>Nenhum fechamento de loja disponível.</p>
          ) : (
            fechamentos.map((loja) => (
              <div key={loja.loja_id} style={{ backgroundColor: themeCard, borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', marginBottom: '20px', border: `1px solid ${themeBorder}`, overflow: 'hidden' }}>
                
                <div onClick={() => setLojaExpandida(lojaExpandida === loja.loja_id ? null : loja.loja_id)} style={{ padding: '20px', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', backgroundColor: lojaExpandida === loja.loja_id ? (isEscuro ? '#0f172a' : '#f8fafc') : themeCard, transition: '0.2s' }}>
                  <div style={{ flex: '1 1 auto' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', color: themeText }}>
                       {loja.nome_fantasia} {loja.temPendencia && <span style={{color: '#ef4444', fontSize: '14px'}}>⚠️</span>}
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
                         const isGreen = item.isBonif || unitF.includes('BONIFIC');
                         const isPendente = item.isPendente;

                         return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: `1px dashed ${themeBorder}`, backgroundColor: isPendente ? (isEscuro ? '#451a03' : '#fff7ed') : (isEscuro ? '#0f172a' : '#f8fafc'), borderRadius: '8px', border: isPendente ? '1px solid #f97316' : 'none' }}>
                              <div style={{ flex: 1, paddingRight: '10px' }}>
                                <span style={{ fontWeight: 'bold', color: themeText }}>
                                  {item.qtdEntregue}x {formatarNomeItem(item.nome)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', whiteSpace: 'nowrap' }}>
                                {/* 💡 BOTÃO DIRETO DE REFAZER (VOLTAR PRO PENDENTE) */}
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

      {/* 💡 ABA 4 NOVA: LISTA RESUMO DE ITENS CONSOLIDADA */}
      {abaAtiva === 'lista_fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Buscar produto..." value={buscaFornList} onChange={e => setBuscaFornList(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
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

                    {/* EXPANSÃO COM DETALHES DOS FORNECEDORES */}
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

      {/* 💡 MODAL DE EDIÇÃO DA LOJA COM BARRA DE BUSCA INTELIGENTE */}
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
                        
                        {(item.isFalta || item.isBoleto || item.isBonif) && (
                          <button onClick={() => setStatusRapido(item.id_pedido, 'normal')} style={{ fontSize: '10px', background: isEscuro ? '#334155' : '#e2e8f0', color: themeText, border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>🔙 DESFAZER</button>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: '1 1 20%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>QTD</label>
                      <input type="text" value={item.qtdEntregue} onChange={e => handleChangeEdicao(item.id_pedido, 'qtdEntregue', e.target.value)} disabled={item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeBorder}`, outline: 'none', textAlign: 'center', fontWeight: 'bold', color: themeText, background: isEscuro ? '#1e293b' : '#fff' }} />
                    </div>

                    <div style={{ flex: '1 1 35%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>V. UNIT</label>
                      <input type="text" value={item.unitDisplay.split('|')[0]} onChange={e => handleChangeEdicao(item.id_pedido, 'unitDisplay', e.target.value)} onBlur={e => handleBlurPreco(item.id_pedido, 'unitDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto || item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeBorder}`, outline: 'none', fontWeight: 'bold', color: corInputValores, background: isEscuro ? '#1e293b' : '#fff' }} />
                    </div>

                    <div style={{ flex: '1 1 35%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>TOTAL</label>
                      <input type="text" value={item.totalDisplay} onChange={e => handleChangeEdicao(item.id_pedido, 'totalDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto || item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${themeBorder}`, outline: 'none', fontWeight: 'bold', color: corInputValores, background: isEscuro ? '#1e293b' : '#fff' }} />
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

    </div>
  );
}
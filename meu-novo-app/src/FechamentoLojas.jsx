import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FechamentoLojas() {
  const [abaAtiva, setAbaAtiva] = useState('lojas'); 
  const [fechamentos, setFechamentos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [lojaExpandida, setLojaExpandida] = useState(null);
  const [lojaEmEdicao, setLojaEmEdicao] = useState(null);
  const [itensEditados, setItensEditados] = useState([]);

  const [modoVisualizacaoImp, setModoVisualizacaoImp] = useState(false);
  const [tipoImpressao, setTipoImpressao] = useState(null); 
  const [lojaParaImprimir, setLojaParaImprimir] = useState(null);

  const [abaForn, setAbaForn] = useState('pendentes'); 
  const [fornExpandido, setFornExpandido] = useState(null);

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

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
      
      const mapaLojas = {};
      const mapaForn = {};

      (pedData || []).forEach(p => {
        if (p.status_compra === 'pendente') return;

        // --- FORNECEDORES (AGRUPAMENTO TOTAL) ---
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
            mapaForn[fNome] = { 
               nome: fNome, 
               totalPix: 0, 
               totalBoleto: 0, 
               totalBruto: 0,
               totalDescontoBonif: 0,
               qtdBonificadaGeral: 0,
               itens: [], 
               statusPagamento: 'pendente' 
            };
          }

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

        // --- LOJAS ---
        const idLoja = extrairNum(p.loja_id);
        if (!idLoja || idLoja <= 1) return;

        if (!mapaLojas[idLoja]) {
          const lInfo = lojasData.find(l => extrairNum(l.codigo_loja) === idLoja);
          mapaLojas[idLoja] = {
            loja_id: idLoja,
            nome_fantasia: lInfo ? lInfo.nome_fantasia : `Loja ${idLoja}`,
            itens: [],
            totalFatura: 0,
            liberadoCliente: false 
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

        // 💡 LÓGICA REFINADA DA BONIFICAÇÃO (APENAS TEXTO LIMPO)
        if (isFalta) {
          unitDisplay = 'FALTA';
          totalDisplay = 'FALTA';
        } else if (p.custo_unit === 'BONIFICAÇÃO') {
          isBonif = true;
          unitDisplay = 'BONIFICAÇÃO';
          totalDisplay = 'BONIFICAÇÃO';
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
              unitDisplay = 'BONIFICAÇÃO';
              totalDisplay = 'BONIFICAÇÃO';
          } else if (isBoleto) {
              unitDisplay = `${qtdBonificadaLoja} BONIFIC.`;
              totalDisplay = 'BOLETO';
          } else {
              unitDisplay = `${qtdBonificadaLoja} BONIFIC.`;
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
            isBonif: isBonif
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
  };

  const handleChangeEdicao = (idPedido, campo, valor) => {
    setItensEditados(prev => prev.map(item => {
      if (item.id_pedido === idPedido) {
        const novoItem = { ...item, [campo]: valor };
        if (!novoItem.isFalta && !novoItem.isBoleto && !novoItem.isBonif) {
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
    if (!valorAtual || valorAtual === 'FALTA' || valorAtual === 'BOLETO' || valorAtual.includes('BONIF')) return;
    let v = String(valorAtual).replace(/[^\d,.]/g, '');
    if (!v.includes(',') && !v.includes('.')) { v = v + ',00'; }
    if(v.includes('.') && !v.includes(',')) v = v.replace('.', ',');
    v = v.replace(/[^\d,]/g, '');
    let num = parseFloat(v.replace(',', '.')) || 0;
    let finalStr = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    setItensEditados(prev => prev.map(item => {
      if(item.id_pedido === idPedido) return { ...item, precoOriginal: finalStr };
      return item;
    }));

    handleChangeEdicao(idPedido, campo, finalStr);
  };

  const setStatusRapido = (idPedido, tipo) => {
    setItensEditados(prev => prev.map(item => {
      if (item.id_pedido === idPedido) {
        if (tipo === 'boleto') return { ...item, isBoleto: true, isFalta: false, isBonif: false, unitDisplay: 'BOLETO', totalDisplay: 'BOLETO', valorNumerico: 0 };
        if (tipo === 'falta') return { ...item, isFalta: true, isBoleto: false, isBonif: false, unitDisplay: 'FALTA', totalDisplay: 'FALTA', valorNumerico: 0 };
        if (tipo === 'normal') {
           const pb = item.precoOriginal && !item.precoOriginal.includes('BONIF') ? item.precoOriginal : '0,00';
           const t = parseInt(item.qtdEntregue) * tratarPrecoNum(pb);
           return { ...item, isFalta: false, isBoleto: false, isBonif: false, unitDisplay: pb, totalDisplay: formatarMoeda(t), valorNumerico: t };
        }
      }
      return item;
    }));
  };

  const salvarEdicaoLoja = async () => {
    setCarregando(true);
    try {
      for (const item of itensEditados) {
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
     if(item.isFalta || item.isBoleto || (item.isBonif && item.unitDisplay.includes('BONIF'))) return acc;
     const val = tratarPrecoNum(item.totalDisplay);
     return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const abrirPreviewImpressao = (tipo, loja = null) => {
    setTipoImpressao(tipo);
    setLojaParaImprimir(loja);
    setModoVisualizacaoImp(true);
  };

  const liberarParaOCliente = async (idLoja) => {
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

  // 💡 LÓGICA DE PDF APRIMORADA (Share Web API + Preview Seguro)
  const processarPDF = async (modo = 'baixar', lojaObj = null) => {
    const elemento = document.getElementById('area-impressao');
    if (!elemento) return;

    let nomeArquivo = `Fechamentos_${dataBr.replace(/\//g, '-')}.pdf`;
    if (lojaObj) {
       nomeArquivo = `${lojaObj.nome_fantasia} - ${dataBr.replace(/\//g, '-')}.pdf`;
    }

    const opt = {
      margin:       [10, 5, 10, 5],
      filename:     nomeArquivo,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }, // 💡 OBRIGATÓRIO RETRATO
      pagebreak:    { mode: 'css', after: '.print-break' }
    };

    // Garante que a biblioteca está pronta
    if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
         const script = document.createElement('script');
         script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
         script.onload = resolve;
         script.onerror = reject;
         document.head.appendChild(script);
      });
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

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Processando...</div>;

  // 💡 DESIGN DA TABELA COM CORES RESTAURADAS
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
            <th style={{...thStyle, width: '25%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '11%'}}>VAL. UNIT.</th>
            <th style={{...thStyle, width: '11%'}}>VAL. TOTAL.</th>
            
            <th style={{ border: 'none', width: '2%', backgroundColor: 'transparent' }}></th>

            <th style={{...thStyle, width: '7%'}}>QUANT.</th>
            <th style={{...thStyle, width: '25%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '11%'}}>VAL. UNIT.</th>
            <th style={{...thStyle, width: '11%'}}>VAL. TOTAL.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
             const renderCell = (item) => {
               if (!item) return <><td style={tdStyle}></td><td style={tdDesc}></td><td style={tdStyle}></td><td style={tdStyle}></td></>;
               
               let corTexto = 'black';
               let uDisp = item.unitDisplay;
               let tDisp = item.totalDisplay;

               // 💡 Lógica de Cores
               if (item.isFalta) {
                  corTexto = '#ef4444'; // Vermelho
                  uDisp = 'FALTA';
                  tDisp = 'FALTA';
               } else if (item.isBonif) {
                  corTexto = '#16a34a'; // Verde
               } else if (item.isBoleto) {
                  corTexto = '#d97706'; // Amarelo Dourado
               }

               if (isMotorista && !item.isFalta) {
                  uDisp = '';
                  tDisp = '';
               } 

               return (
                 <>
                   <td style={tdStyle}>{item.qtdEntregue}</td>
                   <td style={tdDesc}>{formatarNomeItem(item.nome)}</td>
                   <td style={{...tdStyle, fontSize: '11px', color: corTexto}}>{uDisp}</td>
                   <td style={{...tdStyle, fontSize: '11px', color: corTexto}}>{tDisp}</td>
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
      <div style={{ backgroundColor: '#525659', minHeight: '100vh', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
        
        <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', backgroundColor: '#333', padding: '15px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
           <button onClick={() => setModoVisualizacaoImp(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬅ VOLTAR</button>
           
           <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
             
             {/* 💡 NOVO: VISUALIZAR PDF NA TELA ANTES DE BAIXAR */}
             <button onClick={() => processarPDF('preview', isMotGlobal ? null : lojaParaImprimir)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>👁️ VISUALIZAR PDF</button>

             {!isMotGlobal && (
               <button onClick={() => processarPDF('whatsapp', lojaParaImprimir)} style={{ background: '#25d366', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>🟢 COMPARTILHAR WHATSAPP</button>
             )}
             
             <button onClick={() => processarPDF('baixar', isMotGlobal ? null : lojaParaImprimir)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬇️ BAIXAR PDF</button>
           </div>
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
            <div id="area-impressao" className="print-section" style={{ backgroundColor: 'white', color: 'black', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
               
               {lojasParaRenderizar.map((loja, idx) => (
                  <div key={loja.loja_id} className="print-break" style={{ padding: '15px', position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                     
                     <div style={{ border: '2px solid black', boxSizing: 'border-box', padding: '10px', height: '100%' }}>
                         
                         {/* 💡 HEADER LIMPO, CENTRALIZADO E COM LOGO VIA /PUBLIC */}
                         <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderBottom: '2px solid black', paddingBottom: '15px' }}>
                            <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                                {/* Certifique-se de salvar a logo como "logoPDF.png" na pasta public */}
                                <img src="/logoPDF.png" alt="Frazão Frutas & Cia" style={{ maxHeight: '80px', objectFit: 'contain' }} />
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
                                <div style={{ fontWeight: '900', fontSize: '20px', color: 'black', textTransform: 'uppercase' }}>
                                    LOJA: {loja.nome_fantasia}
                                </div>
                                <div style={{ display: 'flex', gap: '30px', fontWeight: '900', fontSize: '18px', color: 'black' }}>
                                    <span>DATA: {dataBr}</span>
                                    {!isMotGlobal && <span>TOTAL: {formatarMoeda(loja.totalFatura)}</span>}
                                </div>
                            </div>
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
            
            /* 💡 MUDANÇA: IMPRESSÃO EM RETRATO (PORTRAIT) SEMPRE */
            .print-section { box-shadow: none !important; min-width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
            @page { margin: 10mm; size: portrait; } 
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f5f5f4', minHeight: '100vh', padding: '10px', paddingBottom: '100px', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: '#111', padding: '20px', borderRadius: '16px', color: '#fff' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>🧮 GESTÃO DE FECHAMENTOS</h2>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>{dataBr}</p>
        </div>
        
        {abaAtiva === 'lojas' && (
          <button onClick={() => abrirPreviewImpressao('motorista_todos')} style={{ backgroundColor: '#fff', color: '#111', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', flex: '1 1 auto', justifyContent: 'center' }}>
            <span>🚚</span> VIAS MOTORISTAS PDF
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', maxWidth: '1000px', margin: '0 auto 20px auto' }}>
        <button onClick={() => setAbaAtiva('lojas')} style={{ flex: 1, minWidth: '150px', padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'lojas' ? '#3b82f6' : '#fff', color: abaAtiva === 'lojas' ? '#fff' : '#64748b', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏪 NOTAS DAS LOJAS
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, minWidth: '150px', padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#f97316' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#64748b', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏢 PAGAR FORNECEDORES
        </button>
      </div>

      {abaAtiva === 'lojas' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {fechamentos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', backgroundColor: '#fff', padding: '40px', borderRadius: '16px' }}>Nenhum fechamento de loja disponível.</p>
          ) : (
            fechamentos.map((loja) => (
              <div key={loja.loja_id} style={{ backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', marginBottom: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                
                <div onClick={() => setLojaExpandida(lojaExpandida === loja.loja_id ? null : loja.loja_id)} style={{ padding: '20px', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', backgroundColor: lojaExpandida === loja.loja_id ? '#f8fafc' : '#fff', transition: '0.2s' }}>
                  <div style={{ flex: '1 1 auto' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', color: '#111' }}>{loja.nome_fantasia}</h1>
                    <span style={{ color: loja.liberadoCliente ? '#22c55e' : '#f59e0b', fontSize: '10px', fontWeight: 'bold', display: 'inline-block', marginTop: '5px', padding: '4px 8px', borderRadius: '6px', backgroundColor: loja.liberadoCliente ? '#dcfce7' : '#fef3c7' }}>
                      {loja.liberadoCliente ? '✅ LIBERADO' : '⏳ AGUARDANDO'}
                    </span>
                  </div>
                  
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '15px' }}>
                     <div>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>TOTAL DA NOTA</span>
                        <span style={{ fontSize: '22px', fontWeight: '900', color: '#111' }}>{formatarMoeda(loja.totalFatura)}</span>
                     </div>
                     <span style={{ fontSize: '18px', color: '#64748b', transform: lojaExpandida === loja.loja_id ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>▼</span>
                  </div>
                </div>

                {lojaExpandida === loja.loja_id && (
                  <div style={{ padding: '20px', borderTop: '2px solid #f1f5f9' }}>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '25px', justifyContent: 'flex-end' }}>
                      <button onClick={() => abrirEdicao(loja)} style={{ background: '#111', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>✏️ EDITAR</button>
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
                         const isGreen = item.isBonif;

                         return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px dashed #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                              <div style={{ flex: 1, paddingRight: '10px' }}>
                                <span style={{ fontWeight: 'bold', color: 'black' }}>
                                  {item.qtdEntregue}x {formatarNomeItem(item.nome)}
                                </span>
                              </div>
                              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <span style={{ color: isOrange ? '#d97706' : isRed ? '#ef4444' : isGreen ? '#16a34a' : '#94a3b8', marginRight: '5px', fontWeight: 'bold' }}>{unitF}</span>
                                <strong style={{ fontWeight: '900', color: isOrange ? '#d97706' : isRed ? '#ef4444' : isGreen ? '#16a34a' : '#111' }}>{totF}</strong>
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
            <button onClick={() => setAbaForn('pendentes')} style={{ flex: '1 1 auto', padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', background: abaForn === 'pendentes' ? '#fcd34d' : '#fff', color: abaForn === 'pendentes' ? '#b45309' : '#64748b' }}>PENDENTES</button>
            <button onClick={() => setAbaForn('finalizados')} style={{ flex: '1 1 auto', padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', background: abaForn === 'finalizados' ? '#22c55e' : '#fff', color: abaForn === 'finalizados' ? '#fff' : '#64748b' }}>FINALIZADOS</button>
            <button onClick={() => setAbaForn('boletos')} style={{ flex: '1 1 auto', padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', background: abaForn === 'boletos' ? '#3b82f6' : '#fff', color: abaForn === 'boletos' ? '#fff' : '#64748b' }}>BOLETOS</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {fornecedoresExibidos.length === 0 ? (
              <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#666', backgroundColor: '#fff', padding: '40px', borderRadius: '16px' }}>Nenhum fornecedor nesta categoria.</p>
            ) : (
              fornecedoresExibidos.map((forn, idx) => {
                const isPago = forn.statusPagamento === 'pago';
                const isBoletoOnly = forn.totalPix === 0 && forn.totalBoleto > 0;
                
                let corBorda = '#fcd34d'; 
                let corFundo = '#fffbeb';
                let corTexto = '#b45309';
                let tagStatus = 'PENDENTE';

                if (isPago) {
                  corBorda = '#22c55e'; 
                  corFundo = '#dcfce7';
                  corTexto = '#166534';
                  tagStatus = 'PAGO ✅';
                } else if (isBoletoOnly) {
                  corBorda = '#60a5fa'; 
                  corFundo = '#eff6ff';
                  corTexto = '#1d4ed8';
                  tagStatus = 'BOLETO 📄';
                }

                const expandido = fornExpandido === forn.nome;

                return (
                  <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '16px', border: `2px solid ${corBorda}`, overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', opacity: isPago ? 0.9 : 1, transition: '0.3s' }}>
                    
                    <div onClick={() => setFornExpandido(expandido ? null : forn.nome)} style={{ padding: '15px', backgroundColor: corFundo, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '13px', color: corTexto, textTransform: 'uppercase', fontWeight: '900' }}>{forn.nome}</h3>
                        <span style={{ fontSize: '9px', fontWeight: '900', color: corTexto, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.5)' }}>{tagStatus}</span>
                      </div>
                      
                      <div style={{ fontSize: '20px', fontWeight: '900', color: corTexto }}>
                         {isBoletoOnly && !expandido ? 'BOLETO' : formatarMoeda(forn.totalPix + forn.totalBoleto)}
                      </div>
                    </div>

                    {expandido && (
                      <div style={{ padding: '15px' }}>
                        
                        {/* 💡 SESSÃO REFINADA DO FORNECEDOR (SEM BOTÃO DE COPIAR, APENAS RESUMO EXATO) */}
                        <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {forn.itens.map((i, k) => {
                             const qtdCobrada = i.qtd - i.qtdBonificada;
                             if (qtdCobrada > 0) {
                               return (
                                 <div key={`norm_${k}`} style={{ fontSize: '11px', color: '#333' }}>
                                   {qtdCobrada} - {formatarNomeItem(i.nomeItem)} - {i.valUnit} = {formatarMoeda(i.totalCobrado)} <span style={{color: '#d97706', fontWeight: 'bold'}}>{i.isBoleto && '(BOLETO)'}</span>
                                 </div>
                               );
                             }
                             return null;
                          })}
                        </div>

                        {forn.totalDescontoBonif > 0 && (
                          <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '10px', marginTop: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a', marginBottom: '5px' }}>Bonificações:</div>
                            <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {forn.itens.filter(i => i.qtdBonificada > 0).map((i, k) => {
                                 const basePriceNum = tratarPrecoNum(i.valUnit);
                                 const valBonif = basePriceNum * i.qtdBonificada;
                                 return (
                                   <div key={`bonif_${k}`} style={{ fontSize: '11px', color: '#16a34a' }}>
                                     {i.qtdBonificada} - {formatarNomeItem(i.nomeItem)} - {formatarMoeda(valBonif)}
                                   </div>
                                 );
                              })}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                               Valor bruto = {formatarMoeda(forn.totalBruto)}
                            </div>
                          </div>
                        )}

                        <div style={{ fontSize: '14px', fontWeight: '900', color: '#111', marginTop: '10px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                           Total a pagar = {formatarMoeda(forn.totalPix + forn.totalBoleto)}
                        </div>

                        {!isBoletoOnly && (
                          <button onClick={() => alternarStatusPagamento(forn.nome)} style={{ width: '100%', marginTop: '15px', padding: '12px', backgroundColor: isPago ? '#f1f5f9' : '#22c55e', color: isPago ? '#64748b' : '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
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

      {lojaEmEdicao && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '800px', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '95vh' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>✏️ EDITAR NOTA</h3>
                <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '12px' }}>{lojaEmEdicao.nome_fantasia}</span>
              </div>
              <button onClick={() => setLojaEmEdicao(null)} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
              {itensEditados.map((item) => {
                const corInputValores = item.isFalta ? '#ef4444' : item.isBoleto ? '#d97706' : item.isBonif ? '#16a34a' : '#111';

                return (
                  <div key={item.id_pedido} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', padding: '15px', backgroundColor: '#f8fafc', marginBottom: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    
                    <div style={{ flex: '1 1 100%' }}>
                      <strong style={{ fontSize: '13px', display: 'block', lineHeight: '1.2', color: 'black' }}>
                        {formatarNomeItem(item.nome)}
                      </strong>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                        
                        <button onClick={() => setStatusRapido(item.id_pedido, 'boleto')} style={{ fontSize: '10px', background: item.isBoleto ? '#d97706' : '#fef3c7', color: item.isBoleto ? '#fff' : '#d97706', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>BOLETO</button>
                        
                        <button onClick={() => setStatusRapido(item.id_pedido, 'falta')} style={{ fontSize: '10px', background: item.isFalta ? '#ef4444' : '#fef2f2', color: item.isFalta ? '#fff' : '#ef4444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>FALTA</button>
                        
                        {(item.isFalta || item.isBoleto || item.isBonif) && (
                          <button onClick={() => setStatusRapido(item.id_pedido, 'normal')} style={{ fontSize: '10px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>🔙 DESFAZER</button>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: '1 1 20%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>QTD</label>
                      <input type="text" value={item.qtdEntregue} onChange={e => handleChangeEdicao(item.id_pedido, 'qtdEntregue', e.target.value)} disabled={item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', textAlign: 'center', fontWeight: 'bold', color: 'black' }} />
                    </div>

                    <div style={{ flex: '1 1 35%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>V. UNIT</label>
                      <input type="text" value={item.unitDisplay.split('|')[0]} onChange={e => handleChangeEdicao(item.id_pedido, 'unitDisplay', e.target.value)} onBlur={e => handleBlurPreco(item.id_pedido, 'unitDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto || item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold', color: corInputValores }} />
                    </div>

                    <div style={{ flex: '1 1 35%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>TOTAL</label>
                      <input type="text" value={item.totalDisplay} onChange={e => handleChangeEdicao(item.id_pedido, 'totalDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto || item.isBonif} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold', color: corInputValores }} />
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
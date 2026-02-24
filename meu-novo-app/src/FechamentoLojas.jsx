import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FechamentoLojas() {
  const [abaAtiva, setAbaAtiva] = useState('lojas'); 
  const [fechamentos, setFechamentos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedoresBd, setFornecedoresBd] = useState([]); 
  const [carregando, setCarregando] = useState(true);

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
    if (!p || p === 'FALTA' || p === 'BOLETO') return 0;
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
        if (p.status_compra === 'pendente') return;

        // ABA DE FORNECEDORES
        if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          const fNome = p.fornecedor_compra ? p.fornecedor_compra.toUpperCase() : 'SEM FORNECEDOR';
          const isBoleto = p.status_compra === 'boleto';
          const valNum = tratarPrecoNum(p.custo_unit);
          const totalItemForn = p.qtd_atendida * valNum;

          if (!mapaForn[fNome]) {
            mapaForn[fNome] = { nome: fNome, totalPix: 0, totalBoleto: 0, itens: [], statusPagamento: 'pendente' };
          }

          mapaForn[fNome].itens.push({ 
            nomeItem: p.nome_produto, 
            qtd: p.qtd_atendida, 
            valUnit: p.custo_unit, 
            totalItem: totalItemForn, 
            isBoleto 
          });

          if (isBoleto) {
            mapaForn[fNome].totalBoleto += totalItemForn;
          } else {
            mapaForn[fNome].totalPix += totalItemForn;
          }
        }

        // ABA DE LOJAS
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

        if (isFalta) {
          unitDisplay = 'FALTA';
          totalDisplay = 'FALTA';
        } else if (isBoleto) {
          unitDisplay = 'BOLETO';
          totalDisplay = 'BOLETO';
        } else {
          qtdDisplay = p.qtd_atendida; 
          const valNum = tratarPrecoNum(p.custo_unit);
          totalItem = p.qtd_atendida * valNum;
          totalDisplay = formatarMoeda(totalItem); 
        }

        // AGRUPAMENTO PARA EVITAR ITENS REPETIDOS
        const nomeUpper = p.nome_produto.toUpperCase();
        const idxExistente = mapaLojas[idLoja].itens.findIndex(i => i.nome === nomeUpper);

        if (idxExistente >= 0) {
          const it = mapaLojas[idLoja].itens[idxExistente];
          if (!isFalta && !isBoleto && !it.isFalta && !it.isBoleto) {
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
            isBoleto: isBoleto
          });
        }

        if (!isFalta && !isBoleto) {
           mapaLojas[idLoja].totalFatura += totalItem;
        }

        if (p.nota_liberada === true) {
           mapaLojas[idLoja].liberadoCliente = true;
        }
      });

      const arrayLojas = Object.values(mapaLojas).sort((a, b) => a.loja_id - b.loja_id);
      arrayLojas.forEach(loja => loja.itens.sort((a, b) => a.nome.localeCompare(b.nome)));
      setFechamentos(arrayLojas);

      const arrayForn = Object.values(mapaForn).sort((a, b) => b.totalPix - a.totalPix);
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
        if (!novoItem.isFalta && !novoItem.isBoleto) {
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
    if (!valorAtual || valorAtual === 'FALTA' || valorAtual === 'BOLETO') return;
    let v = String(valorAtual).replace(/[^\d,.]/g, '');
    if (!v.includes(',') && !v.includes('.')) { v = v + ',00'; }
    if(v.includes('.') && !v.includes(',')) v = v.replace('.', ',');
    v = v.replace(/[^\d,]/g, '');
    let num = parseFloat(v.replace(',', '.')) || 0;
    let finalStr = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    handleChangeEdicao(idPedido, campo, finalStr);
  };

  const setStatusRapido = (idPedido, tipo) => {
    setItensEditados(prev => prev.map(item => {
      if (item.id_pedido === idPedido) {
        if (tipo === 'boleto') return { ...item, isBoleto: true, isFalta: false, unitDisplay: 'BOLETO', totalDisplay: 'BOLETO', valorNumerico: 0 };
        if (tipo === 'falta') return { ...item, isFalta: true, isBoleto: false, unitDisplay: 'FALTA', totalDisplay: 'FALTA', valorNumerico: 0 };
        if (tipo === 'normal') return { ...item, isFalta: false, isBoleto: false, unitDisplay: '0,00', totalDisplay: 'R$ 0,00', valorNumerico: 0 };
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
     if(item.isFalta || item.isBoleto) return acc;
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

  const baixarPDF = () => {
    const elemento = document.getElementById('area-impressao');
    if (!elemento) return;

    const gerar = () => {
      const opt = {
        margin:       10,
        filename:     `Fechamento_${dataBr.replace(/\//g, '-')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }, // Landscape para caber a tabela
        pagebreak:    { mode: 'css', after: '.print-break' }
      };
      window.html2pdf().set(opt).from(elemento).save();
    };

    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = gerar;
      document.body.appendChild(script);
    } else {
      gerar();
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

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>Carregando dados...</div>;

  // ============================================
  // TABELA EXATAMENTE COMO NO PDF (8 COLUNAS SEM ESPAÇO)
  // ============================================
  const renderTabelaDupla = (itensLoja, isMotorista) => {
    const half = Math.ceil(itensLoja.length / 2);
    const rows = [];
    for (let i = 0; i < half; i++) {
      rows.push({ left: itensLoja[i], right: itensLoja[i + half] });
    }

    const thStyle = { border: '1px solid black', padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', backgroundColor: '#e5e7eb' };
    const tdStyle = { border: '1px solid black', padding: '6px', textAlign: 'center', fontSize: '11px', fontWeight: '500' };
    const tdDesc = { ...tdStyle, textAlign: 'left', fontWeight: 'bold' }; 

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{...thStyle, width: '8%'}}>QUANT.</th>
            <th style={{...thStyle, width: '27%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '10%'}}>VAL. UNIT.</th>
            <th style={{...thStyle, width: '10%'}}>VAL. TOTAL.</th>
            
            <th style={{...thStyle, width: '8%'}}>QUANT.</th>
            <th style={{...thStyle, width: '27%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '10%'}}>VAL. UNIT.</th>
            <th style={{...thStyle, width: '10%'}}>VAL. TOTAL.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
             const renderCell = (item) => {
               if (!item) return <><td style={tdStyle}></td><td style={tdDesc}></td><td style={tdStyle}></td><td style={tdStyle}></td></>;
               
               const isFa = item.isFalta;
               const isBo = item.isBoleto;

               const corValores = isFa ? 'red' : isBo ? '#d97706' : 'black';

               let uDisp = isBo ? 'BOLETO' : isFa ? 'FALTA' : item.unitDisplay;
               let tDisp = isBo ? 'BOLETO' : isFa ? 'FALTA' : item.totalDisplay;

               if (isMotorista) {
                  uDisp = isFa ? 'FALTA' : '';
                  tDisp = isFa ? 'FALTA' : '';
               }

               return (
                 <>
                   <td style={{...tdStyle, color: 'black'}}>{item.qtdEntregue}</td>
                   <td style={{...tdDesc, color: 'black'}}>{formatarNomeItem(item.nome)}</td>
                   <td style={{...tdStyle, color: corValores}}>{uDisp}</td>
                   <td style={{...tdStyle, color: corValores}}>{tDisp}</td>
                 </>
               );
             };

             return (
               <tr key={idx}>
                 {renderCell(row.left)}
                 {renderCell(row.right)}
               </tr>
             )
          })}
        </tbody>
      </table>
    );
  };

  // ============================================
  // MODO VISUALIZAÇÃO E IMPRESSÃO (ESTILO PLANILHA EXATA)
  // ============================================
  if (modoVisualizacaoImp) {
    const isMotGlobal = (tipoImpressao === 'motorista_todos' || tipoImpressao === 'motorista_unico');
    const lojasParaRenderizar = (tipoImpressao === 'motorista_todos') ? fechamentos : [lojaParaImprimir];

    return (
      <div style={{ backgroundColor: '#525659', minHeight: '100vh', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
        
        {/* Barra de Ações Responsiva */}
        <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', backgroundColor: '#333', padding: '15px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
           <button onClick={() => setModoVisualizacaoImp(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬅ VOLTAR</button>
           <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
             <button onClick={baixarPDF} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬇️ BAIXAR PDF</button>
             <button onClick={() => window.print()} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>🖨️ IMPRIMIR</button>
           </div>
        </div>

        {/* Wrapper com Overflow para ver a nota inteira no celular sem quebrar */}
        <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
            <div id="area-impressao" className="print-section" style={{ backgroundColor: 'white', color: 'black', minWidth: '900px', maxWidth: '1000px', margin: '0 auto' }}>
               
               {lojasParaRenderizar.map((loja, idx) => (
                  <div key={loja.loja_id} className="print-break" style={{ padding: '20px', position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                     
                     {/* Borda Grossa Envolvendo Cabeçalho e Tabela */}
                     <div style={{ border: '2px solid black', boxSizing: 'border-box' }}>
                         
                         {/* CABEÇALHO IDÊNTICO À IMAGEM */}
                         <div style={{ display: 'flex', flexDirection: 'row', width: '100%', borderBottom: '2px solid black' }}>
                            
                            {/* BLOCO 1: LOJA */}
                            <div style={{ flex: '1.2', borderRight: '2px solid black', padding: '10px', display: 'flex', alignItems: 'center' }}>
                                <span style={{ fontWeight: '900', fontSize: '18px', color: 'black', marginRight: '5px' }}>LOJA:</span>
                                <span style={{ fontWeight: '900', fontSize: '18px', color: 'red', textTransform: 'uppercase' }}>{loja.nome_fantasia}</span>
                            </div>

                            {/* BLOCO 2: LOGO (Recriada com Emojis/Texto para ficar igual a referência) */}
                            <div style={{ flex: '1', borderRight: '2px solid black', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                <span style={{ fontSize: '26px' }}>🍓🍋</span>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '22px', color: '#111', lineHeight: '1' }}>Frazão</strong>
                                    <span style={{ fontSize: '11px', color: '#333', fontWeight: 'bold' }}>Frutas & Cia</span>
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: '900', marginLeft: '5px', color: '#111' }}>(61) 99130-3416</span>
                            </div>

                            {/* BLOCO 3: VALORES E DATA */}
                            <div style={{ flex: '0.8', display: 'flex', flexDirection: 'column' }}>
                                {/* Linha 1: Valor Total */}
                                <div style={{ display: 'flex', flex: 1, borderBottom: '2px solid black' }}>
                                    <div style={{ flex: 1, borderRight: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px', color: 'black' }}>
                                        VALOR TOTAL:
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px', color: 'red' }}>
                                        {!isMotGlobal ? formatarMoeda(loja.totalFatura) : ''}
                                    </div>
                                </div>
                                {/* Linha 2: Data */}
                                <div style={{ display: 'flex', flex: 1 }}>
                                    <div style={{ flex: 1, borderRight: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: 'black' }}>
                                        DATA:
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: 'red' }}>
                                        {dataBr}
                                    </div>
                                </div>
                            </div>

                         </div>

                         {/* TABELA DUPLA */}
                         {renderTabelaDupla(loja.itens, isMotGlobal)}

                     </div>
                  </div>
               ))}
            </div>
        </div>

        {/* CSS DE IMPRESSÃO */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            .print-break { page-break-after: always !important; break-after: page !important; }
            html, body { height: auto !important; overflow: visible !important; background: white; margin: 0; padding: 0; }
            #root, div { overflow: visible !important; height: auto !important; }
            .print-section { box-shadow: none !important; min-width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
            @page { margin: 10mm; size: landscape; }
          }
        `}</style>
      </div>
    );
  }

  // ============================================
  // TELA PRINCIPAL
  // ============================================
  return (
    <div style={{ backgroundColor: '#f5f5f4', minHeight: '100vh', padding: '10px', paddingBottom: '100px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER TELA RESPONSIVO */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: '#111', padding: '20px', borderRadius: '16px', color: '#fff' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>🧮 GESTÃO DE FECHAMENTOS</h2>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>{dataBr}</p>
        </div>
        
        {abaAtiva === 'lojas' && (
          <button onClick={() => abrirPreviewImpressao('motorista_todos')} style={{ backgroundColor: '#fff', color: '#111', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', flex: '1 1 auto', justifyContent: 'center' }}>
            <span>🚚</span> VISUALIZAR TODAS VIAS (MOTORISTAS)
          </button>
        )}
      </div>

      {/* ABAS NAVEGAÇÃO RESPONSIVA */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', maxWidth: '1000px', margin: '0 auto 20px auto' }}>
        <button onClick={() => setAbaAtiva('lojas')} style={{ flex: 1, minWidth: '150px', padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'lojas' ? '#3b82f6' : '#fff', color: abaAtiva === 'lojas' ? '#fff' : '#64748b', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏪 NOTAS DAS LOJAS
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, minWidth: '150px', padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#f97316' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#64748b', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏢 PAGAR FORNECEDORES
        </button>
      </div>

      {/* ============================================ */}
      {/* CONTEÚDO DA ABA: LOJAS */}
      {/* ============================================ */}
      {abaAtiva === 'lojas' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {fechamentos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', backgroundColor: '#fff', padding: '40px', borderRadius: '16px' }}>Nenhum fechamento de loja disponível.</p>
          ) : (
            fechamentos.map((loja) => (
              <div key={loja.loja_id} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                
                {/* CABEÇALHO DO CARD DA LOJA (Responsivo) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px', marginBottom: '15px' }}>
                  <div style={{ flex: '1 1 100%' }}>
                    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', color: '#111' }}>{loja.nome_fantasia}</h1>
                    <span style={{ color: loja.liberadoCliente ? '#22c55e' : '#f59e0b', fontSize: '10px', fontWeight: 'bold', display: 'inline-block', marginTop: '5px', padding: '4px 8px', borderRadius: '6px', backgroundColor: loja.liberadoCliente ? '#dcfce7' : '#fef3c7' }}>
                      {loja.liberadoCliente ? '✅ LIBERADO NO APP DA LOJA' : '⏳ AGUARDANDO LIBERAÇÃO'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>TOTAL DA NOTA</span>
                      <span style={{ fontSize: '20px', fontWeight: '900', color: '#111' }}>{formatarMoeda(loja.totalFatura)}</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                      <button onClick={() => abrirEdicao(loja)} style={{ background: '#111', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>✏️ EDITAR</button>
                      <button onClick={() => abrirPreviewImpressao('motorista_unico', loja)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }} title="Imprimir Motorista Unitário">🚚 MOTORISTA</button>
                      <button onClick={() => abrirPreviewImpressao('loja_unica', loja)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>📄 VIA LOJA</button>
                      {!loja.liberadoCliente && (
                        <button onClick={() => liberarParaOCliente(loja.loja_id)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>📤 LIBERAR</button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Grid Responsivo para Itens na Tela Inicial */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', fontSize: '12px' }}>
                  {loja.itens.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #f1f5f9', color: item.isFalta ? '#ef4444' : '#333' }}>
                      <div style={{ flex: 1, paddingRight: '10px' }}>
                        <span style={{ fontWeight: item.isBoleto ? '900' : 'bold', color: 'black' }}>
                          {item.qtdEntregue}x {formatarNomeItem(item.nome)}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: item.isBoleto ? '#d97706' : item.isFalta ? 'red' : '#94a3b8', marginRight: '5px' }}>{item.isBoleto ? 'BOLETO' : item.isFalta ? 'FALTA' : item.unitDisplay}</span>
                        <strong style={{ fontWeight: '900', color: item.isBoleto ? '#d97706' : item.isFalta ? 'red' : '#111' }}>{item.isBoleto ? 'BOLETO' : item.isFalta ? 'FALTA' : item.totalDisplay}</strong>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ))
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* CONTEÚDO DA ABA: FORNECEDORES */}
      {/* ============================================ */}
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
                const fInfo = fornecedoresBd.find(bd => bd.nome_fantasia.toUpperCase() === forn.nome) || {};

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
                        
                        {!isBoletoOnly && (
                          <div style={{ backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '11px', color: '#334155' }}>
                            <strong style={{ display: 'block', color: '#0f172a', marginBottom: '5px' }}>📄 DADOS PARA PAGAMENTO</strong>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span>Razão:</span> <b>{fInfo.razao_social || 'Não cadastrada'}</b></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span>Chave/CNPJ:</span> <b>{fInfo.cnpj || 'Não cadastrado'}</b></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Telefone:</span> <b>{fInfo.telefone || 'Não cadastrado'}</b></div>
                          </div>
                        )}

                        <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {forn.itens.map((i, k) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: i.isBoleto ? '#3b82f6' : '#333' }}>
                              <span>{i.qtd}x {formatarNomeItem(i.nomeItem)}</span>
                              <b style={{ color: i.isBoleto ? '#2563eb' : '#111' }}>{i.isBoleto ? 'BOLETO' : `${i.valUnit} = ${formatarMoeda(i.totalItem)}`}</b>
                            </div>
                          ))}
                        </div>

                        <div style={{ paddingTop: '10px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#111' }}><span>Total PIX:</span> <b>{formatarMoeda(forn.totalPix)}</b></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6' }}><span>Total Boleto:</span> <b>{formatarMoeda(forn.totalBoleto)}</b></div>
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

      {/* ============================================ */}
      {/* MODAL DE EDIÇÃO MANUAL DE NOTA DA LOJA */}
      {/* ============================================ */}
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
                const corInputValores = item.isFalta ? 'red' : item.isBoleto ? '#d97706' : '#111';

                return (
                  <div key={item.id_pedido} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', padding: '15px', backgroundColor: '#f8fafc', marginBottom: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    
                    <div style={{ flex: '1 1 100%' }}>
                      <strong style={{ fontSize: '13px', display: 'block', lineHeight: '1.2', color: 'black' }}>
                        {formatarNomeItem(item.nome)}
                      </strong>
                      
                      <div style={{ display: 'flex', gap: '5px', marginTop: '6px' }}>
                        <button onClick={() => setStatusRapido(item.id_pedido, 'boleto')} style={{ fontSize: '10px', background: item.isBoleto ? '#d97706' : '#fef3c7', color: item.isBoleto ? '#fff' : '#d97706', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>BOLETO</button>
                        <button onClick={() => setStatusRapido(item.id_pedido, 'falta')} style={{ fontSize: '10px', background: item.isFalta ? '#ef4444' : '#fef2f2', color: item.isFalta ? '#fff' : '#ef4444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>FALTA</button>
                        {(item.isFalta || item.isBoleto) && (
                          <button onClick={() => setStatusRapido(item.id_pedido, 'normal')} style={{ fontSize: '10px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>🔙 DESFAZER</button>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: '1 1 20%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>QTD</label>
                      <input type="text" value={item.qtdEntregue} onChange={e => handleChangeEdicao(item.id_pedido, 'qtdEntregue', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', textAlign: 'center', fontWeight: 'bold', color: 'black' }} />
                    </div>

                    <div style={{ flex: '1 1 35%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>V. UNIT</label>
                      <input type="text" value={item.unitDisplay} onChange={e => handleChangeEdicao(item.id_pedido, 'unitDisplay', e.target.value)} onBlur={e => handleBlurPreco(item.id_pedido, 'unitDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold', color: corInputValores }} />
                    </div>

                    <div style={{ flex: '1 1 35%' }}>
                      <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>TOTAL</label>
                      <input type="text" value={item.totalDisplay} onChange={e => handleChangeEdicao(item.id_pedido, 'totalDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold', color: corInputValores }} />
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
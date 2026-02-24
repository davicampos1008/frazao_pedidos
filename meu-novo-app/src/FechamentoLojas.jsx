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

        mapaLojas[idLoja].itens.push({
          id_pedido: p.id,
          nome: p.nome_produto.toUpperCase(),
          unidade: p.unidade_medida || 'UN',
          qtdOriginal: p.quantidade,
          qtdEntregue: qtdDisplay,
          unitDisplay: unitDisplay,
          totalDisplay: totalDisplay,
          valorNumerico: totalItem,
          isFalta: isFalta,
          isBoleto: isBoleto
        });

        // 💡 Cálculo do totalFatura ignorando Falta e Boleto
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
        // Recalcula total ao digitar
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

  // 💡 MÁGICA: Formata qualquer digito pra ,00 ao clicar fora da caixa
  const handleBlurPreco = (idPedido, campo, valorAtual) => {
    if (!valorAtual || valorAtual === 'FALTA' || valorAtual === 'BOLETO') return;
    
    let v = String(valorAtual).replace(/[^\d,.]/g, '');
    
    // Se digitou só "200" sem virgula nem ponto, transforma em "200,00"
    if (!v.includes(',') && !v.includes('.')) {
        v = v + ',00';
    }

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
  // 💡 MÁQUINA DE TABELAS DUPLAS (8 COLUNAS + ESPAÇO)
  // ============================================
  const renderTabelaDupla = (itensLoja, isMotorista) => {
    const half = Math.ceil(itensLoja.length / 2);
    const rows = [];
    for (let i = 0; i < half; i++) {
      rows.push({ left: itensLoja[i], right: itensLoja[i + half] });
    }

    const thStyle = { border: '2px solid black', padding: '10px', backgroundColor: '#f1f5f9', textAlign: 'center', fontWeight: '900', fontSize: '12px' };
    const tdStyle = { border: '1px solid black', padding: '8px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold' };
    const tdDesc = { ...tdStyle, textAlign: 'left', fontWeight: 'normal' }; 
    const tdSpacer = { border: 'none', width: '25px', backgroundColor: 'transparent' };

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
        <thead>
          <tr>
            <th style={{...thStyle, width: '6%'}}>QUANT</th>
            <th style={{...thStyle, width: '25%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '10%'}}>VAL UNIT</th>
            <th style={{...thStyle, width: '10%'}}>VAL TOTAL</th>
            
            <th style={tdSpacer}></th> {/* RESPIRO */}
            
            <th style={{...thStyle, width: '6%'}}>QUANT</th>
            <th style={{...thStyle, width: '25%'}}>DESCRIÇÃO</th>
            <th style={{...thStyle, width: '10%'}}>VAL UNIT</th>
            <th style={{...thStyle, width: '10%'}}>VAL TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
             const renderCell = (item) => {
               if (!item) return <><td style={tdStyle}></td><td style={tdDesc}></td><td style={tdStyle}></td><td style={tdStyle}></td></>;
               
               const isFa = item.isFalta;
               const isBo = item.isBoleto;

               // COR APENAS PARA OS VALORES UNITÁRIOS E TOTAIS
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
                   {/* DESCRIÇÃO SEMPRE PRETA E SEM A PALAVRA BOLETO */}
                   <td style={{...tdDesc, color: 'black'}}>{formatarNomeItem(item.nome)}</td>
                   <td style={{...tdStyle, color: corValores}}>{uDisp}</td>
                   <td style={{...tdStyle, color: corValores}}>{tDisp}</td>
                 </>
               );
             };

             return (
               <tr key={idx}>
                 {renderCell(row.left)}
                 <td style={tdSpacer}></td>
                 {renderCell(row.right)}
               </tr>
             )
          })}
        </tbody>
      </table>
    );
  };

  // ============================================
  // MODO VISUALIZAÇÃO E IMPRESSÃO (ESTILO NOTA / PDF)
  // ============================================
  if (modoVisualizacaoImp) {
    const isMotGlobal = (tipoImpressao === 'motorista_todos' || tipoImpressao === 'motorista_unico');
    const lojasParaRenderizar = (tipoImpressao === 'motorista_todos') ? fechamentos : [lojaParaImprimir];

    return (
      <div style={{ backgroundColor: '#525659', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
        
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#333', padding: '15px 20px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
           <button onClick={() => setModoVisualizacaoImp(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>⬅ VOLTAR</button>
           <button onClick={() => window.print()} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>🖨️ SALVAR COMO PDF / IMPRIMIR</button>
        </div>

        <div className="print-section" style={{ backgroundColor: 'white', color: 'black', maxWidth: '1000px', margin: '0 auto', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}>
           
           {lojasParaRenderizar.map((loja, idx) => (
              <div key={loja.loja_id} className="print-break" style={{ padding: '30px', position: 'relative', minHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* 💡 CABEÇALHO DA NOTA CENTRALIZADO */}
                  <div style={{ borderBottom: '3px solid black', paddingBottom: '15px', marginBottom: '20px', display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ margin: '0 0 15px 0', textTransform: 'uppercase', fontSize: '42px', fontWeight: '900', fontFamily: 'Impact, sans-serif', textAlign: 'center', width: '100%', letterSpacing: '2px' }}>
                      {loja.nome_fantasia}
                    </h2>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', padding: '0 10px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 'bold' }}>DATA: {dataBr}</span>
                      
                      {/* O valor total some na via do motorista */}
                      {!isMotGlobal && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>VALOR TOTAL DA NOTA</span>
                          <span style={{ fontSize: '32px', fontWeight: '900' }}>{formatarMoeda(loja.totalFatura)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* TABELA DE 8 COLUNAS COM RESPIRO */}
                  <div style={{ flex: 1 }}>
                     {renderTabelaDupla(loja.itens, isMotGlobal)}
                  </div>

                  {/* RODAPÉ COM ASSINATURA */}
                  <div style={{ marginTop: '40px', borderTop: '2px solid black', paddingTop: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>🍎</span>
                      <strong style={{ fontSize: '22px', textTransform: 'uppercase', fontWeight: '900' }}>Frazão Frutas & Cia</strong>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: 'bold' }}>📞 (61) 99130-3416</span>
                  </div>

              </div>
           ))}
        </div>

        {/* 💡 CSS DE IMPRESSÃO QUE FORÇA TODAS AS PÁGINAS A EXISTIREM */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            /* Quebra de página perfeita a cada loja */
            .print-break { page-break-after: always !important; break-after: page !important; }
            html, body { height: auto !important; overflow: visible !important; background: white; margin: 0; padding: 0; }
            #root, div { overflow: visible !important; height: auto !important; }
            .print-section { box-shadow: none !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
            @page { margin: 10mm; size: auto; }
          }
        `}</style>
      </div>
    );
  }

  // ============================================
  // TELA PRINCIPAL
  // ============================================
  return (
    <div style={{ backgroundColor: '#f5f5f4', minHeight: '100vh', padding: '20px', paddingBottom: '100px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER TELA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: '#fff' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>🧮 GESTÃO DE FECHAMENTOS</h2>
          <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>{dataBr}</p>
        </div>
        
        {/* BOTÃO VIA MOTORISTA GLOBAL */}
        {abaAtiva === 'lojas' && (
          <button onClick={() => abrirPreviewImpressao('motorista_todos')} style={{ backgroundColor: '#fff', color: '#111', border: 'none', padding: '12px 20px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
            <span>🚚</span> VISUALIZAR TODAS VIAS (MOTORISTAS)
          </button>
        )}
      </div>

      {/* ABAS NAVEGAÇÃO */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', maxWidth: '1000px', margin: '0 auto 20px auto' }}>
        <button onClick={() => setAbaAtiva('lojas')} style={{ flex: 1, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', backgroundColor: abaAtiva === 'lojas' ? '#3b82f6' : '#fff', color: abaAtiva === 'lojas' ? '#fff' : '#64748b', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          🏪 NOTAS DAS LOJAS
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#f97316' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#64748b', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
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
              <div key={loja.loja_id} style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', marginBottom: '30px', border: '1px solid #e2e8f0' }}>
                
                {/* Cabeçalho do Card da Loja */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px', marginBottom: '20px' }}>
                  <div>
                    <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', color: '#111' }}>{loja.nome_fantasia}</h1>
                    <span style={{ color: loja.liberadoCliente ? '#22c55e' : '#f59e0b', fontSize: '11px', fontWeight: 'bold', display: 'inline-block', marginTop: '5px', padding: '4px 8px', borderRadius: '6px', backgroundColor: loja.liberadoCliente ? '#dcfce7' : '#fef3c7' }}>
                      {loja.liberadoCliente ? '✅ LIBERADO NO APP DA LOJA' : '⏳ AGUARDANDO LIBERAÇÃO'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>TOTAL DA NOTA</span>
                      <span style={{ fontSize: '24px', fontWeight: '900', color: '#111' }}>{formatarMoeda(loja.totalFatura)}</span>
                    </div>
                    
                    {/* Botões de Ação da Loja */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => abrirEdicao(loja)} style={{ flex: 1, background: '#111', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>✏️ EDITAR</button>
                        <button onClick={() => abrirPreviewImpressao('motorista_unico', loja)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }} title="Imprimir Motorista Unitário">🚚</button>
                      </div>
                      <button onClick={() => abrirPreviewImpressao('loja_unica', loja)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>📄 VISUALIZAR VIA</button>
                      {!loja.liberadoCliente && (
                        <button onClick={() => liberarParaOCliente(loja.loja_id)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>📤 LIBERAR CLIENTE</button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lista de Itens Visuais na Tela */}
                <div style={{ columnCount: 2, columnGap: '40px', fontSize: '12px' }}>
                  {loja.itens.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed #f1f5f9', breakInside: 'avoid', color: item.isFalta ? '#ef4444' : '#333' }}>
                      <div style={{ flex: 1, paddingRight: '10px' }}>
                        <span style={{ fontWeight: item.isBoleto ? '900' : 'bold', color: 'black' }}>
                          {item.qtdEntregue}x {formatarNomeItem(item.nome)}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: item.isBoleto ? '#d97706' : item.isFalta ? 'red' : '#94a3b8', marginRight: '10px' }}>{item.isBoleto ? 'BOLETO' : item.isFalta ? 'FALTA' : item.unitDisplay}</span>
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
          
          {/* Sub-Abas Fornecedores */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => setAbaForn('pendentes')} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', background: abaForn === 'pendentes' ? '#fcd34d' : '#fff', color: abaForn === 'pendentes' ? '#b45309' : '#64748b' }}>PENDENTES</button>
            <button onClick={() => setAbaForn('finalizados')} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', background: abaForn === 'finalizados' ? '#22c55e' : '#fff', color: abaForn === 'finalizados' ? '#fff' : '#64748b' }}>FINALIZADOS</button>
            <button onClick={() => setAbaForn('boletos')} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', background: abaForn === 'boletos' ? '#3b82f6' : '#fff', color: abaForn === 'boletos' ? '#fff' : '#64748b' }}>BOLETOS</button>
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '800px', borderRadius: '24px', padding: '30px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>✏️ EDITAR NOTA</h3>
                <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '13px' }}>{lojaEmEdicao.nome_fantasia}</span>
              </div>
              <button onClick={() => setLojaEmEdicao(null)} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              {itensEditados.map((item) => {
                const corInputValores = item.isFalta ? 'red' : item.isBoleto ? '#d97706' : '#111';

                return (
                  <div key={item.id_pedido} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '10px', alignItems: 'center', padding: '15px', backgroundColor: '#f8fafc', marginBottom: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    
                    <div>
                      <strong style={{ fontSize: '12px', display: 'block', lineHeight: '1.1', color: 'black' }}>
                        {formatarNomeItem(item.nome)}
                      </strong>
                      
                      <div style={{ display: 'flex', gap: '5px', marginTop: '6px' }}>
                        <button onClick={() => setStatusRapido(item.id_pedido, 'boleto')} style={{ fontSize: '9px', background: item.isBoleto ? '#d97706' : '#fef3c7', color: item.isBoleto ? '#fff' : '#d97706', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontWeight: 'bold' }}>BOLETO</button>
                        <button onClick={() => setStatusRapido(item.id_pedido, 'falta')} style={{ fontSize: '9px', background: item.isFalta ? '#ef4444' : '#fef2f2', color: item.isFalta ? '#fff' : '#ef4444', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontWeight: 'bold' }}>FALTA</button>
                        {(item.isFalta || item.isBoleto) && (
                          <button onClick={() => setStatusRapido(item.id_pedido, 'normal')} style={{ fontSize: '9px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🔙 DESFAZER</button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>QTD</label>
                      <input type="text" value={item.qtdEntregue} onChange={e => handleChangeEdicao(item.id_pedido, 'qtdEntregue', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', textAlign: 'center', fontWeight: 'bold', color: 'black' }} />
                    </div>

                    <div>
                      <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>V. UNIT</label>
                      <input type="text" value={item.unitDisplay} onChange={e => handleChangeEdicao(item.id_pedido, 'unitDisplay', e.target.value)} onBlur={e => handleBlurPreco(item.id_pedido, 'unitDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold', color: corInputValores }} />
                    </div>

                    <div>
                      <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>TOTAL</label>
                      <input type="text" value={item.totalDisplay} onChange={e => handleChangeEdicao(item.id_pedido, 'totalDisplay', e.target.value)} disabled={item.isFalta || item.isBoleto} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold', color: corInputValores }} />
                    </div>

                  </div>
                )
              })}
            </div>

            <button onClick={salvarEdicaoLoja} style={{ width: '100%', padding: '20px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', marginTop: '20px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
              💾 SALVAR EDIÇÕES - TOTAL: {formatarMoeda(totalAoVivoEdicao)}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}


dados,
tipoImpressao,
dataBr
 {




const formatarMoeda = (valor) => {

return Number(valor || 0).toLocaleString('pt-BR',{

style:'currency',
currency:'BRL'

})

}




const isMotGlobal =

tipoImpressao === 'motorista_todos' ||

tipoImpressao === 'motorista_unico'





return (


<div style={{

padding:'30px',
fontFamily:'Arial'

}}>



{/* BOTÕES */}


<div style={{

marginBottom:'20px',
display:'flex',
gap:'10px'

}}>


<button

onClick={() => window.print()}

style={{

background:'#22c55e',
color:'white',
border:'none',
padding:'10px 20px',
borderRadius:'8px',
fontWeight:'bold',
cursor:'pointer'

}}

>

🖨️ IMPRIMIR

</button>



<button

onClick={() => window.print()}

style={{

background:'#2563eb',
color:'white',
border:'none',
padding:'10px 20px',
borderRadius:'8px',
fontWeight:'bold',
cursor:'pointer'

}}

>

📄 BAIXAR PDF

</button>


</div>




{/* LOJAS */}


{dados.map((loja,index) => (


<div key={index}

style={{

marginBottom:'50px',
pageBreakAfter:'always'

}}

>



{/* CABEÇALHO MODELO FLAMINGO */}



<div style={{

borderBottom:'3px solid black',

paddingBottom:'15px',

marginBottom:'20px'

}}>



<div style={{

display:'flex',

justifyContent:'space-between',

marginBottom:'10px'

}}>



<div style={{

fontSize:'20px',

fontWeight:'bold'

}}>

LOJA: {loja.nome_fantasia}

</div>



<div style={{

fontSize:'20px',

fontWeight:'bold'

}}>

DATA: {dataBr}

</div>


</div>





{!isMotGlobal && (



<div style={{

fontSize:'22px',

fontWeight:'900',

marginTop:'10px'

}}>



VALOR TOTAL:



<span style={{

marginLeft:'20px'

}}>


{formatarMoeda(loja.totalFatura)}


</span>



</div>



)}



</div>






{/* TABELA */}



<table

style={{

width:'100%',
borderCollapse:'collapse'

}}

>


<thead>

<tr>

<th style={celulaCab}>QTD</th>

<th style={celulaCab}>DESCRIÇÃO</th>

{!isMotGlobal && <th style={celulaCab}>VALOR UNIT</th>}

{!isMotGlobal && <th style={celulaCab}>TOTAL</th>}

</tr>

</thead>



<tbody>



{loja.itens.map((item,i) => (



<tr key={i}>


<td style={celula}>

{item.quantidade}

</td>



<td style={celula}>

{item.nome}

</td>



{!isMotGlobal && (

<td style={celula}>

{formatarMoeda(item.valor)}

</td>

)}



{!isMotGlobal && (

<td style={celula}>

{formatarMoeda(

item.quantidade *

item.valor

)}

</td>

)}



</tr>



))}



</tbody>



</table>






</div>



))}





</div>



)



}





const celulaCab = {

border:'1px solid black',

padding:'8px',

fontWeight:'bold',

textAlign:'left',

fontSize:'14px'

}



const celula = {

border:'1px solid black',

padding:'8px',

fontSize:'14px'

}
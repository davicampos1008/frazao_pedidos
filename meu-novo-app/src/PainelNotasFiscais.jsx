import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function PainelNotasFiscais({ isEscuro }) {
  const configDesign = {
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      primaria: '#8b5cf6', 
      sucesso: '#22c55e',
      alerta: '#ef4444',
      aviso: '#f59e0b',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9'
    }
  };

  const [abaAtiva, setAbaAtiva] = useState('pedidos_nf');
  const [subAbaNF, setSubAbaNF] = useState('pendentes'); // 💡 Nova sub-aba
  const [carregando, setCarregando] = useState(true);
  
  const [pedidosFornecedor, setPedidosFornecedor] = useState([]);
  const [pedidosLoja, setPedidosLoja] = useState([]);
  const [listaFornecedores, setListaFornecedores] = useState([]);
  
  const [inputsNF, setInputsNF] = useState({});
  const [busca, setBusca] = useState('');

  // 💡 Controles de Expansão (Cards pequenos)
  const [expandidoNF, setExpandidoNF] = useState(null);
  const [expandidoLoja, setExpandidoLoja] = useState(null);
  const [expandidoCad, setExpandidoCad] = useState(null);

  const [modoImpressaoLojas, setModoImpressaoLojas] = useState(false);

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

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // 💡 NORMALIZADOR DE BUSCA (Ignora acentos e todos os espaços)
  const normalizarBusca = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toLowerCase();
  };

  const tratarPrecoNum = (p) => {
    let precoCln = String(p || '0').replace('R$', '').trim();
    if (precoCln.includes('BONIFICAÇÃO |')) precoCln = precoCln.split('|')[1].trim();
    return parseFloat(precoCln.replaceAll('.', '').replace(',', '.')) || 0;
  };

  async function carregarDados() {
    setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      setListaFornecedores(fornData || []);

      const { data: lojasData } = await supabase.from('lojas').select('*');

      const { data: pedData } = await supabase.from('pedidos')
        .select('*')
        .eq('data_pedido', hoje)
        .in('status_compra', ['atendido', 'boleto']);

      const pedidos = pedData || [];
      const lojas = lojasData || [];

      // 1. AGRUPAR POR FORNECEDOR (Com mesclagem de itens idênticos)
      const mapaForn = {};
      const initNFs = {};
      
      pedidos.forEach(p => {
        const fNome = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase();
        if (!mapaForn[fNome]) {
          mapaForn[fNome] = { fornecedor: fNome, total: 0, nota_fiscal: p.nota_fiscal || '', itens: [] };
          if (p.nota_fiscal) initNFs[fNome] = p.nota_fiscal;
        }

        const valNum = tratarPrecoNum(p.custo_unit);
        const qtd = Number(p.qtd_atendida || 0);
        const totalItem = valNum * qtd;
        const isBoleto = p.status_compra === 'boleto';

        mapaForn[fNome].total += totalItem;

        // 💡 AGRUPA ITENS COM O MESMO NOME, PREÇO E TIPO (Boleto/Vista)
        const itemExistente = mapaForn[fNome].itens.find(i => i.nome === p.nome_produto && i.preco_unit === valNum && i.isBoleto === isBoleto);
        
        if (itemExistente) {
            itemExistente.qtd += qtd;
            itemExistente.total += totalItem;
        } else {
            mapaForn[fNome].itens.push({
              nome: p.nome_produto,
              qtd: qtd,
              und: p.unidade_medida,
              preco_unit: valNum,
              total: totalItem,
              isBoleto: isBoleto
            });
        }

        if (p.nota_fiscal && !mapaForn[fNome].nota_fiscal) {
            mapaForn[fNome].nota_fiscal = p.nota_fiscal;
            initNFs[fNome] = p.nota_fiscal;
        }
      });

      setPedidosFornecedor(Object.values(mapaForn).sort((a,b) => a.fornecedor.localeCompare(b.fornecedor)));
      setInputsNF(initNFs);

      // 2. AGRUPAR POR LOJA
      const mapaLoja = {};
      pedidos.forEach(p => {
        const idLoja = parseInt(String(p.loja_id).match(/\d+/)?.[0]);
        if (!idLoja || idLoja <= 1) return; 

        const lojaInfo = lojas.find(l => parseInt(l.codigo_loja) === idLoja);
        const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim().toUpperCase() : `LOJA ${idLoja}`;

        if (!mapaLoja[nomeLoja]) {
          mapaLoja[nomeLoja] = { loja: nomeLoja, total: 0, itens: [] };
        }

        const valNum = tratarPrecoNum(p.custo_unit);
        const qtd = Number(p.qtd_atendida || 0);
        const totalItem = valNum * qtd;
        const isBoleto = p.status_compra === 'boleto';

        mapaLoja[nomeLoja].total += totalItem;

        // 💡 Agrupa por loja também
        const itemExLoja = mapaLoja[nomeLoja].itens.find(i => i.nome === p.nome_produto && i.preco_unit === valNum && i.isBoleto === isBoleto);
        if (itemExLoja) {
            itemExLoja.qtd += qtd;
            itemExLoja.total += totalItem;
        } else {
            mapaLoja[nomeLoja].itens.push({
              nome: p.nome_produto,
              qtd: qtd,
              und: p.unidade_medida,
              preco_unit: valNum,
              total: totalItem,
              isBoleto: isBoleto
            });
        }
      });

      setPedidosLoja(Object.values(mapaLoja).sort((a,b) => a.loja.localeCompare(b.loja)));

    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const salvarNotaFiscal = async (fornecedorNome) => {
    const numeroNF = inputsNF[fornecedorNome] || '';
    if (!numeroNF.trim()) return alert("Digite o número da Nota Fiscal antes de salvar.");

    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos')
        .update({ nota_fiscal: numeroNF })
        .eq('data_pedido', hoje)
        .eq('fornecedor_compra', fornecedorNome);
      
      if (error) throw error;
      
      alert(`✅ Nota Fiscal do fornecedor ${fornecedorNome} salva com sucesso!`);
      // Ao recarregar, ele já vai pra aba de concluídos pois a nota_fiscal estará preenchida.
      setExpandidoNF(null); 
      carregarDados();
    } catch (err) {
      alert("Erro ao salvar NF: " + err.message);
      setCarregando(false);
    }
  };

  const processarPDFLojas = async (modo = 'baixar') => {
     const elemento = document.getElementById('area-impressao-lojas');
     if (!elemento) return;

     const nomeArquivo = `Fechamento_Lojas_${dataBr.replace(/\//g, '-')}.pdf`;
     const opt = {
       margin:       [10, 10, 15, 10], 
       filename:     nomeArquivo,
       image:        { type: 'jpeg', quality: 0.98 },
       html2canvas:  { scale: 2, useCORS: true, logging: false },
       jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
     };

     if (!window.html2pdf) return alert("Aguarde, carregando biblioteca PDF...");

     if (modo === 'whatsapp') {
       try {
         const pdfBlob = await window.html2pdf().set(opt).from(elemento).output('blob');
         const file = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
         if (navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({ files: [file], title: nomeArquivo, text: 'Resumo Fechamento Lojas' });
         } else {
           alert("Seu dispositivo não suporta compartilhamento direto. O arquivo será baixado.");
           window.html2pdf().set(opt).from(elemento).save();
         }
       } catch (e) { console.error("Erro no Share", e); }
     } else if (modo === 'preview') {
       const pdfBlobUrl = await window.html2pdf().set(opt).from(elemento).output('bloburl');
       window.open(pdfBlobUrl, '_blank');
     } else {
       window.html2pdf().set(opt).from(elemento).save();
     }
  };

  // 💡 MODO IMPRESSÃO LOJAS
  if (modoImpressaoLojas) {
      return (
          <div style={{ backgroundColor: '#525659', minHeight: '100vh', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
              <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', backgroundColor: '#333', padding: '15px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                 <button onClick={() => setModoImpressaoLojas(false)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬅ VOLTAR</button>
                 <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
                   <button onClick={() => processarPDFLojas('preview')} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>👁️ VISUALIZAR PDF</button>
                   <button onClick={() => processarPDFLojas('whatsapp')} style={{ background: '#25d366', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>🟢 COMPARTILHAR WHATSAPP</button>
                   <button onClick={() => processarPDFLojas('baixar')} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬇️ BAIXAR PDF</button>
                 </div>
              </div>

              <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
                  <div id="area-impressao-lojas" className="print-section" style={{ backgroundColor: 'white', color: 'black', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '20px' }}>
                          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', textTransform: 'uppercase' }}>FECHAMENTO DE LOJAS (CUSTO DIÁRIO)</h2>
                          <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>DATA: {dataBr}</span>
                          </div>
                      </div>

                      {pedidosLoja.map(l => (
                          <div key={l.loja} style={{ marginBottom: '20px', border: '1px solid #ccc', borderRadius: '8px', padding: '15px', breakInside: 'avoid' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
                                  <strong style={{ fontSize: '16px' }}>{l.loja}</strong>
                                  <strong style={{ fontSize: '16px' }}>Total: {formatarMoeda(l.total)}</strong>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <tbody>
                                      {l.itens.map((item, idx) => (
                                          <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                                              <td style={{ padding: '4px', fontSize: '12px' }}>{item.qtd} {item.und} - {item.nome} {item.isBoleto && <b style={{color: '#d97706'}}>(BOLETO)</b>}</td>
                                              <td style={{ padding: '4px', fontSize: '12px', textAlign: 'right', fontWeight: 'bold' }}>{formatarMoeda(item.total)}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      ))}
                  </div>
              </div>
              <style>{`
                @media print {
                  .no-print { display: none !important; }
                  html, body { height: auto !important; overflow: visible !important; background: white; margin: 0; padding: 0; }
                  #root, div { overflow: visible !important; height: auto !important; }
                  .print-section { box-shadow: none !important; min-width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
                  @page { margin: 10mm; size: portrait; } 
                }
              `}</style>
          </div>
      );
  }

  if (carregando && pedidosFornecedor.length === 0) return <div style={{ padding: '50px', textAlign: 'center', color: configDesign.cores.textoSuave }}>🔄 Carregando Painel Fiscal...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif', paddingBottom: '50px' }}>
      
      <div style={{ backgroundColor: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', marginBottom: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, display: 'flex', alignItems: 'center', gap: '10px' }}>
          🧾 SETOR FISCAL <span style={{fontSize: '12px', background: configDesign.cores.primaria, color: '#fff', padding: '4px 8px', borderRadius: '8px'}}>LEITURA</span>
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: configDesign.cores.textoSuave }}>Data Base: {dataBr}</p>
      </div>

      {/* TABS PRINCIPAIS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button onClick={() => setAbaAtiva('pedidos_nf')} style={{ flexShrink: 0, padding: '12px 20px', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pedidos_nf' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'pedidos_nf' ? '#fff' : configDesign.cores.textoSuave }}>
          📦 LANÇAR N.F. (FORNECEDORES)
        </button>
        <button onClick={() => setAbaAtiva('fechamento_lojas')} style={{ flexShrink: 0, padding: '12px 20px', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fechamento_lojas' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'fechamento_lojas' ? '#fff' : configDesign.cores.textoSuave }}>
          🏪 RESUMO DE LOJAS
        </button>
        <button onClick={() => setAbaAtiva('cadastros')} style={{ flexShrink: 0, padding: '12px 20px', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'cadastros' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'cadastros' ? '#fff' : configDesign.cores.textoSuave }}>
          📇 DADOS DOS FORNECEDORES
        </button>
      </div>

      <div style={{ backgroundColor: configDesign.cores.fundoCards, borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: `1px solid ${configDesign.cores.borda}`, marginBottom: '20px' }}>
        <span>🔍</span><input placeholder="Buscar na aba atual (ignora acentos/espaços)..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px', color: configDesign.cores.textoForte }} />
      </div>

      {/* ================================================================= */}
      {/* ABA 1: FORNECEDORES E NOTA FISCAL */}
      {/* ================================================================= */}
      {abaAtiva === 'pedidos_nf' && (
        <>
          {/* SUB-ABAS DE NOTA FISCAL (PENDENTE/CONCLUIDO) */}
          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
             <button onClick={() => setSubAbaNF('pendentes')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', backgroundColor: subAbaNF === 'pendentes' ? configDesign.cores.aviso : configDesign.cores.fundoCards, color: subAbaNF === 'pendentes' ? '#fff' : configDesign.cores.textoSuave }}>
               ⏳ PENDENTES DE NF
             </button>
             <button onClick={() => setSubAbaNF('concluidos')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', backgroundColor: subAbaNF === 'concluidos' ? configDesign.cores.sucesso : configDesign.cores.fundoCards, color: subAbaNF === 'concluidos' ? '#fff' : configDesign.cores.textoSuave }}>
               ✅ CONCLUÍDOS (NF LANÇADA)
             </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {pedidosFornecedor
              .filter(f => subAbaNF === 'pendentes' ? !f.nota_fiscal : !!f.nota_fiscal) // Filtro de sub-aba
              .filter(f => normalizarBusca(f.fornecedor).includes(normalizarBusca(busca))) // Filtro de busca blindada
              .map(f => {
                const isConcluido = !!f.nota_fiscal;
                const isExpandido = expandidoNF === f.fornecedor;
                const corStatus = isConcluido ? configDesign.cores.sucesso : configDesign.cores.aviso;
                const bgCard = isConcluido ? (isEscuro ? '#064e3b' : '#f0fdf4') : (isEscuro ? '#78350f' : '#fffbeb');

                return (
                  <div key={f.fornecedor} style={{ background: bgCard, padding: '20px', borderRadius: '16px', border: `2px solid ${corStatus}`, boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    
                    {/* CABEÇALHO DO CARD (CLICÁVEL PARA EXPANDIR) */}
                    <div onClick={() => setExpandidoNF(isExpandido ? null : f.fornecedor)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <h3 style={{ margin: 0, color: isEscuro ? '#fff' : '#111', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🏢 {f.fornecedor} 
                        {isConcluido && <span style={{fontSize: '10px', background: configDesign.cores.sucesso, color: '#fff', padding: '3px 8px', borderRadius: '6px'}}>NF: {f.nota_fiscal}</span>}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <strong style={{ color: corStatus, fontSize: '18px' }}>{formatarMoeda(f.total)}</strong>
                        <span style={{ color: '#ccc', transform: isExpandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                      </div>
                    </div>

                    {/* CORPO EXPANSÍVEL */}
                    {isExpandido && (
                      <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: `1px solid ${corStatus}50` }}>
                        <div style={{ background: configDesign.cores.fundoCards, padding: '15px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px', border: `1px solid ${configDesign.cores.borda}` }}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: configDesign.cores.textoSuave }}>ITENS DO PEDIDO</h4>
                          {f.itens.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: configDesign.cores.textoForte, borderBottom: `1px dashed ${configDesign.cores.borda}`, paddingBottom: '5px' }}>
                                <span>{item.qtd} {item.und} - <b>{item.nome}</b> {item.isBoleto && <span style={{color: configDesign.cores.alerta}}>(BOLETO)</span>}</span>
                                <span>{formatarMoeda(item.preco_unit)} = <b>{formatarMoeda(item.total)}</b></span>
                              </div>
                          ))}
                        </div>

                        {/* ÁREA DE LANÇAMENTO DA NOTA FISCAL */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: configDesign.cores.fundoGeral, padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}` }}>
                          <div style={{ flex: 1 }}>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: configDesign.cores.textoSuave, marginBottom: '5px' }}>NÚMERO DA NOTA FISCAL</label>
                              <input 
                                type="text" 
                                value={inputsNF[f.fornecedor] !== undefined ? inputsNF[f.fornecedor] : (f.nota_fiscal || '')} 
                                onChange={(e) => setInputsNF({...inputsNF, [f.fornecedor]: e.target.value})} 
                                placeholder="Ex: NF-123456" 
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${configDesign.cores.borda}`, outline: 'none', background: configDesign.cores.fundoCards, color: configDesign.cores.textoForte, fontWeight: 'bold', boxSizing: 'border-box' }}
                              />
                          </div>
                          <button onClick={() => salvarNotaFiscal(f.fornecedor)} style={{ background: isConcluido ? '#111' : configDesign.cores.primaria, color: '#fff', border: 'none', padding: '0 20px', height: '42px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '18px' }}>
                              {isConcluido ? '🔄 ATUALIZAR NF' : '💾 SALVAR NF'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            {pedidosFornecedor.filter(f => subAbaNF === 'pendentes' ? !f.nota_fiscal : !!f.nota_fiscal).length === 0 && <div style={{textAlign: 'center', padding: '30px', color: configDesign.cores.textoSuave}}>Nenhum item nesta aba.</div>}
          </div>
        </>
      )}

      {/* ================================================================= */}
      {/* ABA 2: FECHAMENTO DE LOJAS (VISÃO GERAL) */}
      {/* ================================================================= */}
      {abaAtiva === 'fechamento_lojas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
             <button onClick={() => setModoImpressaoLojas(true)} style={{ background: '#111', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
               📥 GERAR PDF (LOJAS)
             </button>
          </div>

          {pedidosLoja.filter(l => normalizarBusca(l.loja).includes(normalizarBusca(busca))).map(l => {
            const isExpandido = expandidoLoja === l.loja;

            return (
              <div key={l.loja} style={{ background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.borda}` }}>
                  <div onClick={() => setExpandidoLoja(isExpandido ? null : l.loja)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '16px' }}>🏪 {l.loja}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <strong style={{ color: configDesign.cores.alerta, fontSize: '18px' }}>{formatarMoeda(l.total)}</strong>
                      <span style={{ color: '#ccc', transform: isExpandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                    </div>
                  </div>

                  {isExpandido && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '20px', paddingTop: '15px', borderTop: `1px solid ${configDesign.cores.borda}` }}>
                      {l.itens.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: configDesign.cores.textoSuave, borderBottom: `1px dashed ${configDesign.cores.borda}`, paddingBottom: '5px' }}>
                            <span>{item.qtd} {item.und} - {item.nome} {item.isBoleto && <b style={{color: configDesign.cores.alerta}}>(BOLETO)</b>}</span>
                            <span>{formatarMoeda(item.total)}</span>
                          </div>
                      ))}
                    </div>
                  )}
              </div>
            );
          })}
          {pedidosLoja.length === 0 && <div style={{textAlign: 'center', padding: '30px', color: configDesign.cores.textoSuave}}>Nenhum fechamento de loja disponível.</div>}
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 3: CADASTRO DE FORNECEDORES */}
      {/* ================================================================= */}
      {abaAtiva === 'cadastros' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {listaFornecedores.filter(f => normalizarBusca(f.nome_fantasia).includes(normalizarBusca(busca))).map(f => {
            const isExpandido = expandidoCad === f.id;

            return (
              <div key={f.id} style={{ background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.borda}` }}>
                  <div onClick={() => setExpandidoCad(isExpandido ? null : f.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '15px' }}>🏢 {f.nome_fantasia}</h3>
                    <span style={{ color: '#ccc', transform: isExpandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                  </div>
                  
                  {isExpandido && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: configDesign.cores.textoSuave, marginTop: '20px', paddingTop: '15px', borderTop: `1px solid ${configDesign.cores.borda}` }}>
                      <div><strong style={{color: configDesign.cores.textoForte}}>Razão Social:</strong> {f.razao_social || 'Não informado'}</div>
                      <div><strong style={{color: configDesign.cores.textoForte}}>CNPJ/CPF:</strong> {f.cnpj_cpf || 'Não informado'}</div>
                      <div style={{ background: isEscuro ? '#14532d' : '#dcfce7', padding: '10px', borderRadius: '8px', color: isEscuro ? '#86efac' : '#166534', border: `1px solid ${configDesign.cores.sucesso}` }}>
                         <strong style={{color: configDesign.cores.textoForte}}>Chave PIX:</strong> <span style={{fontWeight: 'bold'}}>{f.chave_pix || 'Não cadastrada'}</span> ({f.tipo_chave_pix || 'N/A'})
                         <br/>
                         <strong style={{color: configDesign.cores.textoForte}}>Titular PIX:</strong> {f.nome_titular_pix || 'Não informado'}
                      </div>
                      <hr style={{ border: `0.5px dashed ${configDesign.cores.borda}`, margin: '5px 0' }} />
                      <div><strong style={{color: configDesign.cores.textoForte}}>Telefone:</strong> {f.telefone || 'Não informado'}</div>
                      <div><strong style={{color: configDesign.cores.textoForte}}>Endereço:</strong> {f.endereco || 'Não informado'}</div>
                      <div><strong style={{color: configDesign.cores.textoForte}}>Vendedor:</strong> {f.nome_vendedor || 'Não informado'}</div>
                    </div>
                  )}
              </div>
            );
          })}
          {listaFornecedores.length === 0 && <div style={{textAlign: 'center', padding: '30px', color: configDesign.cores.textoSuave}}>Nenhum fornecedor cadastrado.</div>}
        </div>
      )}

    </div>
  );
}
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

  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_painel_nf_data') || obterDataLocal();
  });
  const dataBr = dataFiltro.split('-').reverse().join('/');

  useEffect(() => {
    localStorage.setItem('virtus_painel_nf_data', dataFiltro);
  }, [dataFiltro]);

  const [abaAtiva, setAbaAtiva] = useState('pedidos_nf');
  const [subAbaNF, setSubAbaNF] = useState('pendentes'); 
  const [carregando, setCarregando] = useState(true);
  
  const [pedidosFornecedor, setPedidosFornecedor] = useState([]);
  const [pedidosLoja, setPedidosLoja] = useState([]);
  const [listaFornecedores, setListaFornecedores] = useState([]);
  
  const [inputsNF, setInputsNF] = useState({});
  const [busca, setBusca] = useState('');
  
  const [alertasNomesParecidos, setAlertasNomesParecidos] = useState([]);

  const [expandidoNF, setExpandidoNF] = useState(null);
  const [expandidoLoja, setExpandidoLoja] = useState(null);
  const [expandidoCad, setExpandidoCad] = useState(null);

  const [lojaImpressao, setLojaImpressao] = useState(null);

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const normalizarBusca = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toLowerCase();
  };

  const tratarPrecoNum = (p) => {
    let precoCln = String(p || '0').replace('R$', '').trim();
    if (precoCln.includes('BONIFICAÇÃO |')) precoCln = precoCln.split('|')[1].trim();
    return parseFloat(precoCln.replaceAll('.', '').replace(',', '.')) || 0;
  };

  // 💡 CORREÇÃO: LÓGICA MAIS INTELIGENTE PARA VINCULAR FORNECEDORES PARECIDOS
  const buscarFornecedorSimilar = (nomeBusca, listaBd) => {
      if (!nomeBusca || nomeBusca === 'DESCONHECIDO') return null;
      const normBusca = normalizarBusca(nomeBusca);

      let match = listaBd.find(f => normalizarBusca(f.nome_fantasia) === normBusca);
      if (match) return match;

      match = listaBd.find(f => {
          const normDB = normalizarBusca(f.nome_fantasia);
          return normDB.includes(normBusca) || normBusca.includes(normDB);
      });
      if (match) return match;

      // Se falhar, tenta achar pela PRIMEIRA palavra chave (Ex: "AMANDA BDG" se liga com "AMANDA BANDEJADOS")
      const nomeLimpo = nomeBusca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
      const primeiraPalavraBusca = nomeLimpo.split(/\s+/)[0];

      if (primeiraPalavraBusca && primeiraPalavraBusca.length > 2) {
          match = listaBd.find(f => {
              if(!f.nome_fantasia) return false;
              const dbLimpo = f.nome_fantasia.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
              const dbPrimeiraPalavra = dbLimpo.split(/\s+/)[0];
              return primeiraPalavraBusca === dbPrimeiraPalavra;
          });
      }

      return match || null;
  };

  async function carregarDados(silencioso = false) {
    if (!silencioso) {
        setCarregando(true);
    }
    
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      let fornecedoresDB = fornData || [];
      setListaFornecedores(fornecedoresDB);

      const { data: lojasData } = await supabase.from('lojas').select('*');

      const { data: pedData } = await supabase.from('pedidos')
        .select('*')
        .eq('data_pedido', dataFiltro) 
        .in('status_compra', ['atendido', 'boleto']);

      const pedidos = pedData || [];
      const lojas = lojasData || [];

      // 💡 CORREÇÃO: Limpando a flag de "ALERTA|" logo de cara para não criar lixo no banco
      const nomesNosPedidos = [...new Set(pedidos.map(p => {
          let nome = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase();
          if (nome.startsWith('ALERTA|')) nome = nome.replace('ALERTA|', '');
          return nome;
      }))];
      
      const novosFornecedoresParaCriar = [];

      for (const nomePed of nomesNosPedidos) {
          if (nomePed === 'DESCONHECIDO') continue;
          const matchBanco = buscarFornecedorSimilar(nomePed, fornecedoresDB);
          
          if (!matchBanco) {
              novosFornecedoresParaCriar.push({
                  nome_fantasia: nomePed,
                  tipo_chave_pix: 'CPF', 
                  status: true
              });
          }
      }

      if (novosFornecedoresParaCriar.length > 0) {
          const { data: criados } = await supabase.from('fornecedores').insert(novosFornecedoresParaCriar).select();
          if (criados) {
             fornecedoresDB = [...fornecedoresDB, ...criados];
             setListaFornecedores(fornecedoresDB.sort((a,b) => a.nome_fantasia.localeCompare(b.nome_fantasia)));
          }
      }

      const mapaForn = {};
      const initNFs = {};
      
      pedidos.forEach(p => {
        let fNomeOriginal = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase();
        if (fNomeOriginal.startsWith('ALERTA|')) fNomeOriginal = fNomeOriginal.replace('ALERTA|', '');
        
        const infoFornBD = buscarFornecedorSimilar(fNomeOriginal, fornecedoresDB);
        const fNomeOficial = infoFornBD ? infoFornBD.nome_fantasia.toUpperCase() : fNomeOriginal;
        
        let tipoPessoa = 'SEM_CADASTRO';
        let doc = '';

        if (infoFornBD && infoFornBD.documento) {
            doc = infoFornBD.documento;
            const tipoDoc = String(infoFornBD.tipo_documento || '').toUpperCase().trim();
            if (tipoDoc === 'CNPJ') {
                tipoPessoa = 'PJ';
            } else if (tipoDoc === 'CPF') {
                tipoPessoa = 'PF';
            } else {
                const docLimpo = doc.replace(/\D/g, '');
                tipoPessoa = docLimpo.length > 11 ? 'PJ' : 'PF';
            }
        }

        if (!mapaForn[fNomeOficial]) {
          mapaForn[fNomeOficial] = { 
              fornecedor: fNomeOficial, 
              tipoPessoa: tipoPessoa, 
              documento: doc, 
              dadosCadastrais: infoFornBD || null, 
              total: 0, 
              nota_fiscal: p.nota_fiscal || '', 
              itens: [],
              ids_pedidos: [] // 💡 AQUI GARANTE QUE TODAS AS LINHAS DA TABELA SERÃO ATUALIZADAS
          };
          if (p.nota_fiscal) initNFs[fNomeOficial] = p.nota_fiscal;
        }

        // Salva os IDs dos pedidos deste fornecedor
        if (p.id && !mapaForn[fNomeOficial].ids_pedidos.includes(p.id)) {
            mapaForn[fNomeOficial].ids_pedidos.push(p.id);
        }

        const valNum = tratarPrecoNum(p.custo_unit);
        const qtd = Number(p.quantidade || 0); 
        const isBoleto = p.status_compra === 'boleto';

        const itemExistente = mapaForn[fNomeOficial].itens.find(i => i.nome === p.nome_produto && i.isBoleto === isBoleto);
        
        if (itemExistente) {
            itemExistente.qtd += qtd;
            if (valNum > itemExistente.preco_unit) {
                itemExistente.preco_unit = valNum;
            }
            itemExistente.total = itemExistente.qtd * itemExistente.preco_unit;
        } else {
            mapaForn[fNomeOficial].itens.push({
              nome: p.nome_produto,
              qtd: qtd,
              und: p.unidade_medida,
              preco_unit: valNum,
              total: valNum * qtd,
              isBoleto: isBoleto
            });
        }

        if (p.nota_fiscal && !mapaForn[fNomeOficial].nota_fiscal) {
            mapaForn[fNomeOficial].nota_fiscal = p.nota_fiscal;
            initNFs[fNomeOficial] = p.nota_fiscal;
        }
      });

      Object.values(mapaForn).forEach(forn => {
          forn.total = forn.itens.reduce((acc, item) => acc + item.total, 0);
      });

      setPedidosFornecedor(Object.values(mapaForn).sort((a,b) => a.fornecedor.localeCompare(b.fornecedor)));
      
      if (!silencioso) {
         setInputsNF(initNFs);
      } else {
         setInputsNF(prev => {
            const novo = { ...prev };
            Object.keys(initNFs).forEach(k => {
               if (!novo[k] && initNFs[k]) novo[k] = initNFs[k];
            });
            return novo;
         });
      }

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
        const qtd = Number(p.quantidade || 0); 
        const isBoleto = p.status_compra === 'boleto';

        const itemExLoja = mapaLoja[nomeLoja].itens.find(i => i.nome === p.nome_produto && i.isBoleto === isBoleto);
        if (itemExLoja) {
            itemExLoja.qtd += qtd;
            if (valNum > itemExLoja.preco_unit) {
                itemExLoja.preco_unit = valNum;
            }
            itemExLoja.total = itemExLoja.qtd * itemExLoja.preco_unit;
        } else {
            mapaLoja[nomeLoja].itens.push({
              nome: p.nome_produto,
              qtd: qtd,
              und: p.unidade_medida,
              preco_unit: valNum,
              total: valNum * qtd,
              isBoleto: isBoleto
            });
        }
      });

      Object.values(mapaLoja).forEach(loja => {
          loja.total = loja.itens.reduce((acc, item) => acc + item.total, 0);
      });

      setPedidosLoja(Object.values(mapaLoja).sort((a,b) => a.loja.localeCompare(b.loja)));

    } catch (err) {
      console.error(err);
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
    const intervalo = setInterval(() => {
        carregarDados(true); 
    }, 1000);
    return () => clearInterval(intervalo);
  }, [dataFiltro]);

  // 💡 CORREÇÃO: Salvando diretamente usando o array de IDs mapeado
  const salvarNotaFiscal = async (fornecedorNome) => {
    const numeroNF = inputsNF[fornecedorNome] || '';
    if (!numeroNF.trim()) return alert("Digite o número da Nota Fiscal antes de salvar.");

    const fornAtual = pedidosFornecedor.find(f => f.fornecedor === fornecedorNome);
    if (!fornAtual || !fornAtual.ids_pedidos || fornAtual.ids_pedidos.length === 0) {
        return alert("Não foi possível identificar os pedidos para salvar a NF.");
    }

    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos')
        .update({ nota_fiscal: numeroNF })
        .in('id', fornAtual.ids_pedidos); // 🔥 ISSO RESOLVE O PROBLEMA DE NÃO SALVAR A NF
      
      if (error) throw error;
      
      alert(`✅ Nota Fiscal do fornecedor ${fornecedorNome} salva com sucesso!`);
      setExpandidoNF(null); 
      carregarDados();
    } catch (err) {
      alert("Erro ao salvar NF: " + err.message);
      setCarregando(false);
    }
  };

  // 💡 CORREÇÃO: Apagando diretamente usando o array de IDs mapeado
  const apagarNotaFiscal = async (fornecedorNome) => {
    if (!window.confirm(`Tem certeza que deseja apagar a Nota Fiscal do fornecedor ${fornecedorNome} e devolver para os pendentes?`)) return;

    const fornAtual = pedidosFornecedor.find(f => f.fornecedor === fornecedorNome);
    if (!fornAtual || !fornAtual.ids_pedidos || fornAtual.ids_pedidos.length === 0) {
        return alert("Não foi possível identificar os pedidos para apagar a NF.");
    }

    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos')
        .update({ nota_fiscal: null })
        .in('id', fornAtual.ids_pedidos); // 🔥 ISSO RESOLVE O PROBLEMA DE NÃO APAGAR A NF
      
      if (error) throw error;
      
      alert(`🗑️ Nota Fiscal apagada com sucesso!`);
      setExpandidoNF(null); 
      setInputsNF(prev => ({...prev, [fornecedorNome]: ''}));
      carregarDados();
    } catch (err) {
      alert("Erro ao apagar NF: " + err.message);
      setCarregando(false);
    }
  };

  const processarPDFLojas = async (modo = 'baixar') => {
     const elemento = document.getElementById('area-impressao-lojas');
     if (!elemento) return;

     const nomeAjustado = lojaImpressao === 'TODAS' ? 'Todas_Lojas' : lojaImpressao.replace(/[^a-zA-Z0-9]/g, '_');
     const nomeArquivo = `Fechamento_${nomeAjustado}_${dataBr.replace(/\//g, '-')}.pdf`;
     
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

  if (lojaImpressao) {
      const lojasParaImprimir = lojaImpressao === 'TODAS' ? pedidosLoja : pedidosLoja.filter(l => l.loja === lojaImpressao);

      return (
          <div style={{ backgroundColor: '#525659', minHeight: '100vh', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
              <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', backgroundColor: '#333', padding: '15px', borderRadius: '8px', marginBottom: '20px', position: 'sticky', top: '10px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                 <button onClick={() => setLojaImpressao(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬅ VOLTAR</button>
                 <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
                   <button onClick={() => processarPDFLojas('preview')} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>👁️ VISUALIZAR PDF</button>
                   <button onClick={() => processarPDFLojas('whatsapp')} style={{ background: '#25d366', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>🟢 COMPARTILHAR WHATSAPP</button>
                   <button onClick={() => processarPDFLojas('baixar')} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: '1 1 auto' }}>⬇️ BAIXAR PDF</button>
                 </div>
              </div>

              <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
                  <div id="area-impressao-lojas" className="print-section" style={{ backgroundColor: 'white', color: 'black', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '20px' }}>
                          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', textTransform: 'uppercase' }}>
                              {lojaImpressao === 'TODAS' ? 'FECHAMENTO DE LOJAS (CUSTO DIÁRIO)' : `FECHAMENTO - ${lojaImpressao}`}
                          </h2>
                          <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block' }}>DATA: {dataBr}</span>
                          </div>
                      </div>

                      {lojasParaImprimir.map(l => (
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
      
      <div style={{ backgroundColor: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', marginBottom: '20px', border: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, display: 'flex', alignItems: 'center', gap: '10px' }}>
            🧾 SETOR FISCAL <span style={{fontSize: '12px', background: configDesign.cores.primaria, color: '#fff', padding: '4px 8px', borderRadius: '8px'}}>LEITURA</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <span style={{ color: configDesign.cores.textoSuave, fontSize: '13px', fontWeight: 'bold' }}>Data Base:</span>
            <input 
              type="date" 
              value={dataFiltro} 
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{ background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte, border: `1px solid ${configDesign.cores.borda}`, borderRadius: '6px', padding: '4px 8px', fontSize: '13px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            />
            {dataFiltro !== obterDataLocal() && (
              <button 
                onClick={() => setDataFiltro(obterDataLocal())} 
                style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                🗓️ VOLTAR PARA HOJE
              </button>
            )}
          </div>
        </div>
      </div>

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

      {abaAtiva === 'pedidos_nf' && (
        <>
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
              .filter(f => subAbaNF === 'pendentes' ? !f.nota_fiscal : !!f.nota_fiscal)
              .filter(f => normalizarBusca(f.fornecedor).includes(normalizarBusca(busca)))
              .map(f => {
                const isConcluido = !!f.nota_fiscal;
                const isExpandido = expandidoNF === f.fornecedor;
                const corStatus = isConcluido ? configDesign.cores.sucesso : configDesign.cores.aviso;
                const bgCard = isConcluido ? (isEscuro ? '#064e3b' : '#f0fdf4') : (isEscuro ? '#78350f' : '#fffbeb');

                return (
                  <div key={f.fornecedor} style={{ background: bgCard, padding: '20px', borderRadius: '16px', border: `2px solid ${corStatus}`, boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    
                    <div onClick={() => setExpandidoNF(isExpandido ? null : f.fornecedor)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <h3 style={{ margin: 0, color: isEscuro ? '#fff' : '#111', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        🏢 {f.fornecedor} 
                        
                        {f.tipoPessoa === 'PJ' && (
                            <span style={{fontSize: '9px', background: '#3b82f6', color: '#fff', padding: '3px 6px', borderRadius: '4px', fontWeight: '900'}}>PESSOA JURÍDICA: {f.documento}</span>
                        )}
                        {f.tipoPessoa === 'PF' && (
                            <span style={{fontSize: '9px', background: '#10b981', color: '#fff', padding: '3px 6px', borderRadius: '4px', fontWeight: '900'}}>PESSOA FÍSICA: {f.documento}</span>
                        )}
                        {f.tipoPessoa === 'SEM_CADASTRO' && (
                            <span style={{fontSize: '9px', background: configDesign.cores.alerta, color: '#fff', padding: '3px 6px', borderRadius: '4px', fontWeight: '900'}}>SEM CADASTRO</span>
                        )}

                        {isConcluido && <span style={{fontSize: '10px', background: configDesign.cores.sucesso, color: '#fff', padding: '3px 8px', borderRadius: '6px'}}>NF: {f.nota_fiscal}</span>}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <strong style={{ color: corStatus, fontSize: '18px' }}>{formatarMoeda(f.total)}</strong>
                        <span style={{ color: '#ccc', transform: isExpandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                      </div>
                    </div>

                    {isExpandido && (
                      <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: `1px solid ${corStatus}50` }}>
                        
                        {f.dadosCadastrais && (
                           <div style={{ background: configDesign.cores.fundoGeral, padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, marginBottom: '15px', fontSize: '13px', color: configDesign.cores.textoForte }}>
                               <div style={{fontWeight: '900', marginBottom: '8px', fontSize: '12px', color: configDesign.cores.textoSuave}}>📋 DADOS CADASTRADOS DO FORNECEDOR</div>
                               
                               {/* 💡 MAPEAMENTO EXATO COM AS COLUNAS SOLICITADAS */}
                               <div><strong>Nome Fantasia:</strong> {f.dadosCadastrais.nome_fantasia || 'Não informado'}</div>
                               <div style={{marginTop: '4px'}}><strong>Nome Completo/Razão Social:</strong> {f.dadosCadastrais.nome_completo || 'Não informado'}</div>
                               
                               <div style={{marginTop: '4px'}}>
                                   <strong>CPF/CNPJ:</strong> {f.dadosCadastrais.documento ? f.dadosCadastrais.documento : <span style={{color: configDesign.cores.alerta}}>Não Cadastrado no Banco de Dados</span>}
                               </div>
                               
                               <div style={{marginTop: '4px'}}><strong>Telefone:</strong> {f.dadosCadastrais.telefone || 'Não informado'}</div>
                               
                               <div style={{marginTop: '8px', background: isEscuro ? '#14532d' : '#dcfce7', padding: '10px', borderRadius: '8px', color: isEscuro ? '#86efac' : '#166534', border: `1px solid ${configDesign.cores.sucesso}`}}>
                                   <strong>Chave PIX:</strong> <span style={{fontWeight: 'bold'}}>{f.dadosCadastrais.chave_pix || 'Não cadastrada'}</span> {f.dadosCadastrais.tipo_chave_pix ? `(${f.dadosCadastrais.tipo_chave_pix})` : ''}
                               </div>
                           </div>
                        )}

                        <div style={{ background: configDesign.cores.fundoCards, padding: '15px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px', border: `1px solid ${configDesign.cores.borda}` }}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: configDesign.cores.textoSuave }}>ITENS DO PEDIDO</h4>
                          {f.itens.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: configDesign.cores.textoForte, borderBottom: `1px dashed ${configDesign.cores.borda}`, paddingBottom: '5px' }}>
                                <span>{item.qtd} {item.und} - <b>{item.nome}</b> {item.isBoleto && <span style={{color: configDesign.cores.alerta}}>(BOLETO)</span>}</span>
                                <span>{formatarMoeda(item.preco_unit)} = <b>{formatarMoeda(item.total)}</b></span>
                              </div>
                          ))}
                        </div>

                        {f.tipoPessoa === 'PJ' && (
                           <div style={{ background: '#3b82f6', color: '#fff', padding: '10px 15px', borderRadius: '12px 12px 0 0', textAlign: 'center', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}>
                              🏢 PESSOA JURÍDICA (INSERIR NOTA FISCAL ABAIXO)
                           </div>
                        )}
                        
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: configDesign.cores.fundoGeral, padding: '15px', borderRadius: f.tipoPessoa === 'PJ' ? '0 0 12px 12px' : '12px', border: `1px solid ${configDesign.cores.borda}`, borderTop: f.tipoPessoa === 'PJ' ? 'none' : `1px solid ${configDesign.cores.borda}`, marginTop: f.tipoPessoa === 'PJ' ? '0' : '10px' }}>
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
                          
                          {/* 💡 BOTÃO DE APAGAR ADICIONADO AQUI */}
                          {isConcluido && (
                              <button onClick={() => apagarNotaFiscal(f.fornecedor)} style={{ background: configDesign.cores.alerta, color: '#fff', border: 'none', padding: '0 15px', height: '42px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '18px' }}>
                                  🗑️ APAGAR
                              </button>
                          )}
                          
                          <button onClick={() => salvarNotaFiscal(f.fornecedor)} style={{ background: isConcluido ? '#111' : configDesign.cores.primaria, color: '#fff', border: 'none', padding: '0 20px', height: '42px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '18px' }}>
                              {isConcluido ? '🔄 ATUALIZAR' : '💾 SALVAR NF'}
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

      {abaAtiva === 'fechamento_lojas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
             <button onClick={() => setLojaImpressao('TODAS')} style={{ background: '#111', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
               📥 GERAR PDF (TODAS AS LOJAS)
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
                      
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                         <button onClick={() => setLojaImpressao(l.loja)} style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                            📄 VER PDF
                         </button>
                      </div>

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
                      
                      {/* 💡 MAPEAMENTO EXATO COM AS COLUNAS SOLICITADAS */}
                      <div><strong style={{color: configDesign.cores.textoForte}}>Nome Fantasia:</strong> {f.nome_fantasia || 'Não informado'}</div>
                      <div><strong style={{color: configDesign.cores.textoForte}}>Razão Social / Nome Completo:</strong> {f.nome_completo || 'Não informado'}</div>
                      
                      <div>
                          <strong style={{color: configDesign.cores.textoForte}}>CNPJ/CPF:</strong> {f.documento ? f.documento : <span style={{color: configDesign.cores.alerta}}>Não informado</span>}
                      </div>

                      <div><strong style={{color: configDesign.cores.textoForte}}>Telefone:</strong> {f.telefone || 'Não informado'}</div>
                      
                      <div style={{ background: isEscuro ? '#14532d' : '#dcfce7', padding: '10px', borderRadius: '8px', color: isEscuro ? '#86efac' : '#166534', border: `1px solid ${configDesign.cores.sucesso}` }}>
                         <strong style={{color: configDesign.cores.textoForte}}>Chave PIX:</strong> <span style={{fontWeight: 'bold'}}>{f.chave_pix || 'Não cadastrada'}</span> {f.tipo_chave_pix ? `(${f.tipo_chave_pix})` : ''}
                         <br/>
                         <strong style={{color: configDesign.cores.textoForte}}>Titular PIX:</strong> {f.nome_titular_pix || 'Não informado'}
                      </div>

                      <hr style={{ border: `0.5px dashed ${configDesign.cores.borda}`, margin: '5px 0' }} />
                      
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
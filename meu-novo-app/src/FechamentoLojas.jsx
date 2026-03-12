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

    // Atualização silenciosa a cada 2 segundos
    const intervalo = setInterval(() => {
      carregar(true);
    }, 2000);

    return () => clearInterval(intervalo);
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

  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true);
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

        // --- 💡 LÓGICA FORNECEDORES (CUSTO REAL) ---
        if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          let fNomeOriginal = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'SEM FORNECEDOR';
          if (fNomeOriginal.startsWith('ALERTA|')) fNomeOriginal = fNomeOriginal.replace('ALERTA|', '');
          
          let baseVal = p.custo_unit || 'R$ 0,00'; 
          if (String(baseVal).includes('BONIFICAÇÃO |')) {
             baseVal = String(baseVal).split('|')[1] ? String(baseVal).split('|')[1].trim() : 'R$ 0,00';
          }
          const valNum = tratarPrecoNum(baseVal);

          // 💡 DEFINIÇÃO SE É BOLETO: Status banco ou Valor Zerado
          const isBoleto = p.status_compra === 'boleto' || valNum === 0;
          const fNome = isBoleto ? `${fNomeOriginal} (BOLETO)` : fNomeOriginal;

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
               itensRaw: {}, 
               itens: [], 
               lojasEnvolvidas: {},
               statusPagamento: 'pendente' 
            };
          }

          const idLojaForn = extrairNum(p.loja_id);
          const lInfoForn = (lojasData || []).find(l => extrairNum(l.codigo_loja) === idLojaForn);
          const nomeLojaForn = lInfoForn ? lInfoForn.nome_fantasia : `Loja ${idLojaForn}`;
          mapaForn[fNome].lojasEnvolvidas[nomeLojaForn] = lInfoForn || { nome_fantasia: nomeLojaForn, placa_caminhao: 'SEM PLACA' };

          const keyItem = `${p.nome_produto}_${valNum}_${isBoleto}`;
          if (!mapaForn[fNome].itensRaw[keyItem]) {
              mapaForn[fNome].itensRaw[keyItem] = {
                  nomeItem: p.nome_produto,
                  unidade: p.unidade_medida || 'UN',
                  qtd: 0,
                  qtdBonificada: 0,
                  valNum: valNum,
                  isBoleto: isBoleto
              };
          }
          const raw = mapaForn[fNome].itensRaw[keyItem];
          raw.qtd += Number(p.qtd_atendida || 0);
          raw.qtdBonificada += Number(p.qtd_bonificada || 0);
        }

        // --- LOJAS (CUSTO VENDA/REPASSE) ---
        const idLoja = extrairNum(p.loja_id);
        if (!idLoja || idLoja <= 1) return;
        if (!mapaLojas[idLoja]) {
          const lInfo = lojasData.find(l => extrairNum(l.codigo_loja) === idLoja);
          mapaLojas[idLoja] = { loja_id: idLoja, nome_fantasia: lInfo ? lInfo.nome_fantasia : `Loja ${idLoja}`, itens: [], totalFatura: 0, liberadoCliente: false, temPendencia: false };
        }

        const isFalta = p.status_compra === 'falta' || p.qtd_atendida === 0;
        const isBoletoLoja = p.status_compra === 'boleto';
        let unitParaLoja = p.preco_venda || p.custo_unit || 'R$ 0,00';
        let totalItem = 0;
        let totalDisplay = '';

        if (!isFalta && !isBoletoLoja) {
          const valNumLoja = tratarPrecoNum(unitParaLoja);
          totalItem = Math.max(0, (p.qtd_atendida || 0) - (p.qtd_bonificada || 0)) * valNumLoja;
          totalDisplay = formatarMoeda(totalItem);
        } else {
          totalDisplay = isFalta ? 'FALTA' : 'BOLETO';
        }

        mapaLojas[idLoja].itens.push({
          id_pedido: p.id,
          nome: String(p.nome_produto || "").toUpperCase(),
          unidade: p.unidade_medida || 'UN',
          qtdEntregue: p.qtd_atendida,
          unitDisplay: isFalta ? 'FALTA' : isBoletoLoja ? 'BOLETO' : unitParaLoja,
          totalDisplay: totalDisplay,
          valorNumerico: totalItem,
          isFalta: isFalta,
          isBoleto: isBoletoLoja
        });
        mapaLojas[idLoja].totalFatura += totalItem;
      });

      // Consolidação Fornecedores
      Object.values(mapaForn).forEach(forn => {
          Object.values(forn.itensRaw).forEach(raw => {
              const totalLinha = Math.max(0, raw.qtd - raw.qtdBonificada) * raw.valNum;
              forn.itens.push({
                  nomeItem: raw.nomeItem,
                  unidade: raw.unidade,
                  qtd: raw.qtd,
                  qtdBonificada: raw.qtdBonificada,
                  valUnit: formatarMoeda(raw.valNum),
                  totalCobrado: totalLinha,
                  isBoleto: raw.isBoleto
              });
              if (raw.isBoleto) forn.totalBoleto += totalLinha;
              else forn.totalPix += totalLinha;
          });
          delete forn.itensRaw;
      });

      setFechamentos(Object.values(mapaLojas).sort((a,b) => a.loja_id - b.loja_id));
      
      const arrayForn = Object.values(mapaForn).sort((a, b) => a.nome.localeCompare(b.nome));
      setFornecedores(prev => {
          if (!prev || prev.length === 0) return arrayForn;
          return arrayForn.map(n => {
              const old = prev.find(o => o.nome === n.nome);
              if (old) n.statusPagamento = old.statusPagamento;
              return n;
          });
      });

    } catch (err) { console.error(err); } finally { if (!silencioso) setCarregando(false); }
  }

  const aplicarPrecoMedia = async () => {
    if(!itemMediaSelecionado || !valorMediaInput) return alert("Selecione o item e o valor.");
    let num = parseFloat(valorMediaInput.replace(',', '.')) || 0;
    let finalStr = formatarMoeda(num);
    setCarregando(true);
    try {
        await supabase.from('pedidos').update({ preco_venda: finalStr }).eq('data_pedido', dataFiltro).eq('nome_produto', itemMediaSelecionado);
        setModalMediaAberto(false); setValorMediaInput(''); carregar();
    } catch(e) { alert(e.message); setCarregando(false); }
  };

  const copiarPixFornecedor = (chave, fNome) => {
    if (!chave || chave === 'Não cadastrada') return alert("PIX não cadastrado.");
    navigator.clipboard.writeText(chave); alert(`PIX Copiado: ${chave}`);
  };

  const fornecedoresExibidos = fornecedores.filter(f => {
    const isPago = f.statusPagamento === 'pago';
    const hasBoleto = f.nome.includes('(BOLETO)') || f.totalPix === 0;
    if (abaForn === 'pendentes') return !isPago && !hasBoleto;
    if (abaForn === 'finalizados') return isPago && !hasBoleto;
    if (abaForn === 'boletos') return hasBoleto;
    return true;
  });

  if (carregando && fechamentos.length === 0) return <div style={{ padding: '50px', textAlign: 'center' }}>🔄 Carregando...</div>;

  return (
    <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', paddingBottom: '100px', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: themeMenuTop, padding: '20px', borderRadius: '16px', color: '#fff' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>🧮 GESTÃO DE FECHAMENTOS</h2>
          <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', marginTop: '10px' }} />
        </div>
        <button onClick={() => setModalMediaAberto(true)} style={{ backgroundColor: '#8b5cf6', color: '#fff', border: 'none', padding: '12px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>📊 VALOR MÉDIA</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', maxWidth: '1000px', margin: '0 auto 20px auto' }}>
        <button onClick={() => setAbaAtiva('lojas')} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', fontWeight: '900', background: abaAtiva === 'lojas' ? '#3b82f6' : themeCard, color: abaAtiva === 'lojas' ? '#fff' : themeText }}>🏪 LOJAS</button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', fontWeight: '900', background: abaAtiva === 'fornecedores' ? '#f97316' : themeCard, color: abaAtiva === 'fornecedores' ? '#fff' : themeText }}>🏢 FORNECEDORES</button>
      </div>

      {abaAtiva === 'fornecedores' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => setAbaForn('pendentes')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: abaForn === 'pendentes' ? '#fcd34d' : themeCard }}>PIX PENDENTE</button>
            <button onClick={() => setAbaForn('finalizados')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: abaForn === 'finalizados' ? '#22c55e' : themeCard }}>FINALIZADOS</button>
            <button onClick={() => setAbaForn('boletos')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', background: abaForn === 'boletos' ? '#3b82f6' : themeCard }}>BOLETOS 📄</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {fornecedoresExibidos.map((forn, idx) => (
              <div key={idx} style={{ backgroundColor: themeCard, borderRadius: '16px', border: `2px solid ${forn.statusPagamento === 'pago' ? '#22c55e' : '#e2e8f0'}`, overflow: 'hidden' }}>
                <div onClick={() => setFornExpandido(fornExpandido === forn.nome ? null : forn.nome)} style={{ padding: '15px', background: forn.nome.includes('(BOLETO)') ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                  <h3 style={{ margin: 0, fontSize: '13px', color: '#111' }}>{forn.nome}</h3>
                  <div style={{ fontSize: '20px', fontWeight: '900', marginTop: '5px' }}>{formatarMoeda(forn.totalPix + forn.totalBoleto)}</div>
                  
                  {/* 💡 ALERTA DE BOLETO DENTRO DO CARD */}
                  {(forn.nome.includes('(BOLETO)') || forn.totalPix === 0) && (
                    <div style={{ marginTop: '10px', background: '#dbeafe', color: '#1e40af', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', border: '1px solid #3b82f6' }}>
                       📄 ESTE É UM PAGAMENTO VIA BOLETO / VALOR ZERADO
                    </div>
                  )}
                </div>

                {fornExpandido === forn.nome && (
                  <div style={{ padding: '15px', borderTop: `1px solid ${themeBorder}` }}>
                    {forn.itens.map((i, k) => (
                      <div key={k} style={{ fontSize: '11px', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{i.qtd}x {i.nomeItem}</span>
                        <strong style={{ color: i.isBoleto || i.valUnit === 'R$ 0,00' ? '#3b82f6' : 'inherit' }}>
                           {i.isBoleto || i.valUnit === 'R$ 0,00' ? '📄 BOLETO' : i.valUnit}
                        </strong>
                      </div>
                    ))}
                    {!forn.nome.includes('(BOLETO)') && (
                       <button onClick={() => copiarPixFornecedor(forn.chavePix)} style={{ width: '100%', marginTop: '10px', padding: '10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>COPIAR PIX</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL MÉDIA */}
      {modalMediaAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: themeCard, padding: '25px', borderRadius: '16px', width: '90%', maxWidth: '400px' }}>
            <h3 style={{ marginTop: 0 }}>📊 Aplicar Valor Média</h3>
            <select value={itemMediaSelecionado} onChange={e => setItemMediaSelecionado(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px' }}>
                <option value="">Selecione o produto...</option>
                {[...new Set(fechamentos.flatMap(l => l.itens.map(i => i.nome)))].sort().map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input type="text" placeholder="Valor Média (ex: 5,50)" value={valorMediaInput} onChange={e => setValorMediaInput(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ccc' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
               <button onClick={() => setModalMediaAberto(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#64748b', color: '#fff' }}>CANCELAR</button>
               <button onClick={aplicarPrecoMedia} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#8b5cf6', color: '#fff' }}>APLICAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
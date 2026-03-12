import React, { useState, useEffect, useRef } from 'react';
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

  const [dataFiltro, setDataFiltro] = useState(() => localStorage.getItem('virtus_fechamento_data') || obterDataLocal());
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
  const [abaForn, setAbaForn] = useState('pendentes'); 
  const [fornExpandido, setFornExpandido] = useState(null);
  const [modalMediaAberto, setModalMediaAberto] = useState(false);
  const [itemMediaSelecionado, setItemMediaSelecionado] = useState('');
  const [valorMediaInput, setValorMediaInput] = useState('');

  // Estilos de cores
  const themeBg = isEscuro ? '#0f172a' : '#f5f5f4';
  const themeCard = isEscuro ? '#1e293b' : '#ffffff';
  const themeText = isEscuro ? '#f8fafc' : '#111111';
  const themeBorder = isEscuro ? '#334155' : '#e2e8f0';
  const themeMenuTop = isEscuro ? '#020617' : '#111111';

  // 🔄 ATUALIZAÇÃO AUTOMÁTICA (POLLING) CADA 5 SEGUNDOS
  useEffect(() => {
    const intervalo = setInterval(() => {
      carregar(false); // Carrega em background sem o loading principal
    }, 5000);
    return () => clearInterval(intervalo);
  }, [dataFiltro]);

  useEffect(() => {
    localStorage.setItem('virtus_fechamento_data', dataFiltro);
    carregar(true);
  }, [dataFiltro]);

  const removerAcentos = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  // 🔍 BUSCA POR SIMILARIDADE (Ex: Cereja -> Tomate Cereja)
  const buscarFornecedorSimilar = (nomeDigitado, listaBd) => {
    if (!nomeDigitado) return null;
    const nm = removerAcentos(nomeDigitado).trim();
    if (!nm) return null;
    
    // 1. Busca exata
    let match = listaBd.find(f => removerAcentos(f.nome_fantasia).trim() === nm || removerAcentos(f.nome_completo).trim() === nm);
    if (match) return match;
    
    // 2. Busca por inclusão (Similaridade pedida: Cereja vs Tomate Cereja)
    match = listaBd.find(f => {
       const nmFantasia = removerAcentos(f.nome_fantasia).trim();
       const nmCompleto = removerAcentos(f.nome_completo).trim();
       return nmFantasia.includes(nm) || nm.includes(nmFantasia) || nmCompleto.includes(nm) || nm.includes(nmCompleto);
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

  async function carregar(comLoading = true) {
    if (comLoading) setCarregando(true);
    try {
      const { data: lojasData } = await supabase.from('lojas').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      
      // 🏢 Puxando apenas os dados necessários do fornecedor
      const { data: fornData } = await supabase.from('fornecedores').select('nome_fantasia, nome_completo, telefone, tipo_documento, cpf_cnpj, chave_pix'); 
      
      if (fornData) setFornecedoresBd(fornData);

      const mapaLojas = {};
      const mapaForn = {};

      (pedData || []).forEach(p => {
        // Lógica de Pendentes
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
                qtdEntregue: p.quantidade,
                unitDisplay: 'AGUARDANDO COMPRA',
                isPendente: true 
            });
            return;
        }

        // --- FORNECEDORES ---
        if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          let fNomeOriginal = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'SEM FORNECEDOR';
          if (fNomeOriginal.startsWith('ALERTA|')) fNomeOriginal = fNomeOriginal.replace('ALERTA|', '');
          
          const isBoleto = p.status_compra === 'boleto';
          const fNome = isBoleto ? `${fNomeOriginal} (BOLETO)` : fNomeOriginal;
          
          let baseVal = p.custo_unit;
          if (String(p.custo_unit).includes('BONIFICAÇÃO |')) {
             baseVal = baseVal.split('|')[1] ? baseVal.split('|')[1].trim() : 'R$ 0,00';
          }

          const valNum = tratarPrecoNum(baseVal);
          const valTotalItem = (Number(p.qtd_atendida) - (Number(p.qtd_bonificada) || 0)) * valNum;

          if (!mapaForn[fNome]) {
            const fInfo = buscarFornecedorSimilar(fNomeOriginal, fornData || []);
            
            mapaForn[fNome] = { 
                nome: fNome, 
                // 💡 Dados do Sistema
                nomeFantasia: fInfo ? fInfo.nome_fantasia : fNomeOriginal,
                nomeCompleto: fInfo ? fInfo.nome_completo : 'SEM CADASTRO',
                telefone: fInfo ? fInfo.telefone : 'Não cadastrado',
                cpfCnpj: fInfo ? fInfo.cpf_cnpj : 'Não cadastrado',
                tipoPessoa: fInfo ? (fInfo.tipo_documento === 'CPF' ? 'PESSOA FÍSICA' : 'PESSOA JURÍDICA') : 'DESCONHECIDO',
                chavePix: fInfo ? fInfo.chave_pix : '',
                possuiCadastro: !!fInfo, // Define se pode ou não "lançar"
                totalPix: 0, 
                totalBoleto: 0, 
                itens: [], 
                statusPagamento: 'pendente' 
            };
          }

          mapaForn[fNome].itens.push({ 
            nomeItem: p.nome_produto, 
            qtd: p.qtd_atendida, 
            valUnit: formatarMoeda(valNum), 
            total: valTotalItem,
            isBoleto 
          });

          if (isBoleto) mapaForn[fNome].totalBoleto += valTotalItem;
          else mapaForn[fNome].totalPix += valTotalItem;
        }
      });

      setFornecedores(Object.values(mapaForn).sort((a, b) => a.nome.localeCompare(b.nome)));
      // ... resto da lógica de lojas se mantém igual ao original ...
    } catch (err) { console.error(err); } finally { if (comLoading) setCarregando(false); }
  }

  const copiarPixFornecedor = (chave, fNome) => {
    if (!chave || chave === 'Não cadastrada') return alert("Este fornecedor não possui PIX cadastrado.");
    navigator.clipboard.writeText(chave);
    alert(`PIX Copiado: ${chave}\nFornecedor: ${fNome}`);
  };

  const alternarStatusPagamento = (nomeForn) => {
    setFornecedores(prev => prev.map(f => {
      if (f.nome === nomeForn) return { ...f, statusPagamento: f.statusPagamento === 'pago' ? 'pendente' : 'pago' };
      return f;
    }));
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', color: themeText }}>🔄 V.I.R.T.U.S Carregando...</div>;

  return (
    <div style={{ backgroundColor: themeBg, minHeight: '100vh', padding: '10px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER SIMPLIFICADO COM BOTÃO ATUALIZAR */}
      <div style={{ maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: themeMenuTop, padding: '20px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
        <div>
           <h2 style={{ margin: 0, fontSize: '18px' }}>🧮 GESTÃO V.I.R.T.U.S</h2>
           <span style={{fontSize: '10px', color: '#22c55e'}}>● Sincronizado em tempo real</span>
        </div>
        <button onClick={() => carregar(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>🔄 ATUALIZAR AGORA</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', maxWidth: '1000px', margin: '0 auto 20px auto' }}>
        <button onClick={() => setAbaAtiva('lojas')} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', backgroundColor: abaAtiva === 'lojas' ? '#3b82f6' : themeCard, color: abaAtiva === 'lojas' ? '#fff' : themeText, fontWeight: 'bold' }}>🏪 LOJAS</button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: 'none', backgroundColor: abaAtiva === 'fornecedores' ? '#f97316' : themeCard, color: abaAtiva === 'fornecedores' ? '#fff' : themeText, fontWeight: 'bold' }}>🏢 FORNECEDORES</button>
      </div>

      {abaAtiva === 'fornecedores' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px', maxWidth: '1000px', margin: '0 auto' }}>
          {fornecedores.map((forn, idx) => {
            const isPago = forn.statusPagamento === 'pago';
            const cadastrado = forn.possuiCadastro;

            return (
              <div key={idx} style={{ backgroundColor: themeCard, borderRadius: '16px', border: `2px solid ${cadastrado ? (isPago ? '#22c55e' : '#f97316') : '#ef4444'}`, overflow: 'hidden', opacity: cadastrado ? 1 : 0.7 }}>
                
                <div onClick={() => setFornExpandido(fornExpandido === forn.nome ? null : forn.nome)} style={{ padding: '15px', cursor: 'pointer', background: !cadastrado ? '#fef2f2' : (isPago ? '#dcfce7' : 'transparent') }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: !cadastrado ? '#ef4444' : '#64748b' }}>
                        {cadastrado ? forn.tipoPessoa : '⚠️ NÃO CADASTRADO'}
                    </span>
                    {!cadastrado && <span style={{fontSize: '18px'}}>🚫</span>}
                  </div>
                  <h3 style={{ margin: '5px 0', fontSize: '14px', color: themeText }}>{forn.nomeFantasia}</h3>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: themeText }}>{formatarMoeda(forn.totalPix + forn.totalBoleto)}</div>
                </div>

                {fornExpandido === forn.nome && (
                  <div style={{ padding: '15px', borderTop: `1px solid ${themeBorder}` }}>
                    <div style={{ backgroundColor: isEscuro ? '#0f172a' : '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '12px' }}>
                        <p style={{ margin: '2px 0' }}><strong>Nome Completo:</strong> {forn.nomeCompleto}</p>
                        <p style={{ margin: '2px 0' }}><strong>Telefone:</strong> {forn.telefone}</p>
                        <p style={{ margin: '2px 0' }}><strong>Doc:</strong> {forn.cpfCnpj}</p>
                    </div>

                    {cadastrado && forn.totalPix > 0 && (
                      <button onClick={() => copiarPixFornecedor(forn.chavePix, forn.nome)} style={{ width: '100%', padding: '10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', marginBottom: '10px', cursor: 'pointer' }}>COPIAR PIX</button>
                    )}

                    <button 
                        disabled={!cadastrado}
                        onClick={() => alternarStatusPagamento(forn.nome)} 
                        style={{ width: '100%', padding: '10px', background: !cadastrado ? '#94a3b8' : (isPago ? '#64748b' : '#3b82f6'), color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: cadastrado ? 'pointer' : 'not-allowed' }}
                    >
                      {!cadastrado ? 'BLOQUEADO - SEM CADASTRO' : (isPago ? 'DESFAZER LANÇAMENTO' : 'CONCLUIR PAGAMENTO')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ... Manter resto da estrutura de Lojas e Modais ... */}
    </div>
  );
}
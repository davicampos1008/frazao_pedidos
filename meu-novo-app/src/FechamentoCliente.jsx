import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function FechamentoCliente({ isEscuro }) { 
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState(null); // { role, loja_id }
  const [lojasLiberadas, setLojasLiberadas] = useState([]); // Lojas que possuem notas liberadas
  const [lojaSelecionada, setLojaSelecionada] = useState('');
  const [dadosFechamento, setDadosFechamento] = useState(null);
  
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(obterDataLocal());

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
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9'
    }
  };

  useEffect(() => {
    carregarPerfil();
  }, []);

  useEffect(() => {
    if (perfil) carregarDados();
  }, [perfil, dataFiltro, lojaSelecionada]);

  async function carregarPerfil() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData } = await supabase
        .from('perfis')
        .select('role, loja_id')
        .eq('id', user.id)
        .single();

      setPerfil(perfilData);
      if (perfilData?.role === 'cliente') {
        setLojaSelecionada(perfilData.loja_id);
      }
    } catch (err) {
      console.error("Erro ao carregar perfil:", err);
    }
  }

  async function carregarDados() {
    setCarregando(true);
    try {
      // 1. Buscar nomes das lojas para o seletor (apenas se for admin)
      if (perfil?.role === 'admin') {
        const { data: lojas } = await supabase.from('lojas').select('codigo_loja, nome_fantasia');
        setLojasLiberadas(lojas || []);
      }

      // 2. Buscar pedidos que estão com nota_liberada = true
      let query = supabase
        .from('pedidos')
        .select('*')
        .eq('data_pedido', dataFiltro)
        .eq('nota_liberada', true);

      if (perfil?.role === 'cliente') {
        query = query.eq('loja_id', perfil.loja_id);
      } else if (lojaSelecionada) {
        query = query.eq('loja_id', lojaSelecionada);
      }

      const { data: pedidos } = await query;
      processarPedidos(pedidos || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const processarPedidos = (pedidos) => {
    if (pedidos.length === 0) {
      setDadosFechamento(null);
      return;
    }

    const itensProcessados = pedidos.map(p => {
      const valorRaw = p.preco_venda || p.custo_unit || 'R$ 0,00';
      let displayPreco = valorRaw;
      let numPreco = 0;
      let status = 'OK';

      if (p.status_compra === 'falta') {
        displayPreco = 'FALTA';
        status = 'FALTA';
      } else if (p.status_compra === 'boleto') {
        displayPreco = 'BOLETO';
        status = 'BOLETO';
      } else {
        const pLimpo = String(valorRaw).replace('BONIFICAÇÃO |', '').replace('R$', '').trim();
        numPreco = parseFloat(pLimpo.replace(/\./g, '').replace(',', '.')) || 0;
        displayPreco = formatarMoeda(numPreco);
      }

      const qtd = Number(p.qtd_atendida || p.quantidade || 0);
      return {
        nome: p.nome_produto,
        qtd,
        und: p.unidade_medida || 'UN',
        unitario: displayPreco,
        total: numPreco * qtd,
        status
      };
    });

    const totalGeral = itensProcessados.reduce((acc, i) => acc + i.total, 0);
    setDadosFechamento({
      itens: itensProcessados,
      totalGeral
    });
  };

  const imprimirPDF = () => {
      window.print(); // Utiliza o padrão de impressão do navegador ou você pode integrar o html2pdf aqui
  };

  return (
    <div style={{ backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER E FILTROS */}
      <div style={{ maxWidth: '900px', margin: '0 auto 25px auto', backgroundColor: configDesign.cores.fundoCards, padding: '25px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '22px' }}>
              {perfil?.role === 'admin' ? '📑 Visualização Administrativa' : '🏪 Nota Fiscal da Loja'}
            </h2>
            <p style={{ margin: '5px 0 0 0', color: configDesign.cores.textoSuave, fontSize: '13px' }}>
              Consulte aqui o seu fechamento diário liberado.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input 
              type="date" 
              value={dataFiltro} 
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${configDesign.cores.borda}`, fontWeight: 'bold', outline: 'none' }}
            />
            {perfil?.role === 'admin' && (
              <select 
                value={lojaSelecionada} 
                onChange={(e) => setLojaSelecionada(e.target.value)}
                style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${configDesign.cores.borda}`, fontWeight: 'bold', outline: 'none' }}
              >
                <option value="">Selecione a Loja...</option>
                {lojasLiberadas.map(l => (
                  <option key={l.codigo_loja} value={l.codigo_loja}>{l.nome_fantasia}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: configDesign.cores.textoSuave }}>🔄 Buscando dados liberados...</div>
      ) : !dadosFechamento ? (
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: configDesign.cores.fundoCards, borderRadius: '20px', maxWidth: '900px', margin: '0 auto', border: `1px dashed ${configDesign.cores.borda}` }}>
           <span style={{ fontSize: '50px' }}>⏳</span>
           <h3 style={{ color: configDesign.cores.textoForte }}>Nenhum fechamento liberado</h3>
           <p style={{ color: configDesign.cores.textoSuave }}>Seu fechamento ainda está sendo processado ou não foi liberado para esta data.</p>
        </div>
      ) : (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* CARD PRINCIPAL */}
          <div id="area-nota-cliente" style={{ backgroundColor: configDesign.cores.fundoCards, borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            
            {/* TOPO DA NOTA */}
            <div style={{ padding: '30px', backgroundColor: isEscuro ? '#0f172a' : '#f1f5f9', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: '900', color: configDesign.cores.primaria, textTransform: 'uppercase', letterSpacing: '1px' }}>Resumo Financeiro</span>
                <h1 style={{ margin: '5px 0 0 0', color: configDesign.cores.textoForte, fontSize: '28px', fontWeight: '900' }}>{formatarMoeda(dadosFechamento.totalGeral)}</h1>
              </div>
              <button onClick={imprimirPDF} style={{ background: configDesign.cores.textoForte, color: isEscuro ? '#000' : '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                📄 GERAR PDF
              </button>
            </div>

            {/* TABELA DE ITENS */}
            <div style={{ padding: '20px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${configDesign.cores.borda}` }}>
                    <th style={{ textAlign: 'left', padding: '15px 10px', fontSize: '12px', color: configDesign.cores.textoSuave }}>DESCRIÇÃO DO PRODUTO</th>
                    <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '12px', color: configDesign.cores.textoSuave }}>QTD</th>
                    <th style={{ textAlign: 'right', padding: '15px 10px', fontSize: '12px', color: configDesign.cores.textoSuave }}>PREÇO UNIT.</th>
                    <th style={{ textAlign: 'right', padding: '15px 10px', fontSize: '12px', color: configDesign.cores.textoSuave }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosFechamento.itens.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${configDesign.cores.borda}`, backgroundColor: item.status !== 'OK' ? (isEscuro ? '#331a1a' : '#fff1f1') : 'transparent' }}>
                      <td style={{ padding: '15px 10px', fontSize: '14px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>{item.nome}</td>
                      <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '14px', color: configDesign.cores.textoForte }}>{item.qtd} <small>{item.und}</small></td>
                      <td style={{ textAlign: 'right', padding: '15px 10px', fontSize: '14px', fontWeight: 'bold', color: item.status === 'FALTA' ? configDesign.cores.alerta : item.status === 'BOLETO' ? configDesign.cores.aviso : configDesign.cores.textoSuave }}>
                        {item.unitario}
                      </td>
                      <td style={{ textAlign: 'right', padding: '15px 10px', fontSize: '14px', fontWeight: '900', color: configDesign.cores.textoForte }}>
                        {item.status === 'OK' ? formatarMoeda(item.total) : item.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* RODAPÉ DA NOTA */}
            <div style={{ padding: '20px 30px', backgroundColor: isEscuro ? '#1e293b' : '#fafafa', borderTop: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ fontSize: '12px', color: configDesign.cores.textoSuave }}>
                  Dúvidas sobre os valores? Entre em contato com o financeiro.
               </div>
               <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: configDesign.cores.textoSuave, display: 'block' }}>Data da Entrega</span>
                  <strong style={{ color: configDesign.cores.textoForte }}>{dataBr(dataFiltro)}</strong>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function dataBr(data) {
    return data.split('-').reverse().join('/');
  }
}
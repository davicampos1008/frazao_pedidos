import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function ConferenciaMadrugada() {
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif", raioBordaGlobal: '20px', sombraSuave: '0 8px 30px rgba(0,0,0,0.04)', corTextoPrincipal: '#111111', corTextoSecundario: '#64748b' },
    cards: { fundo: '#ffffff' },
    cores: { primaria: '#f97316', sucesso: '#22c55e', alerta: '#ef4444', aviso: '#eab308', fundoGeral: '#f4f4f5' }
  };

  const [abaAtiva, setAbaAtiva] = useState('operacional');
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  
  const [dadosAgrupados, setDadosAgrupados] = useState([]);
  const [metricasGestao, setMetricasGestao] = useState({ total: 0, recebido: 0, falta: 0, aguardando: 0 });
  const [fornecedoresExpandidos, setFornecedoresExpandidos] = useState({});

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: lojasData } = await supabase.from('lojas').select('*');
      // 💡 Puxa APENAS os itens que foram comprados (atendido ou boleto)
      const { data: pedData } = await supabase.from('pedidos')
        .select('*')
        .eq('data_pedido', hoje)
        .in('status_compra', ['atendido', 'boleto']);
      
      const pedidos = pedData || [];
      const lojasDb = lojasData || [];

      let metTotal = 0; let metRecebido = 0; let metFalta = 0; let metAguardando = 0;
      const mapaForn = {};

      pedidos.forEach(p => {
        const fNome = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase();
        const pNome = String(p.nome_produto || 'SEM NOME').toUpperCase();
        const idLoja = extrairNum(p.loja_id);
        const lojaInfo = lojasDb.find(l => extrairNum(l.codigo_loja) === idLoja);
        const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim().toUpperCase() : `LOJA ${idLoja}`;
        const statusRec = p.status_recebimento || 'aguardando'; // aguardando, recebido, falta

        metTotal++;
        if (statusRec === 'recebido') metRecebido++;
        else if (statusRec === 'falta') metFalta++;
        else metAguardando++;

        if (!mapaForn[fNome]) {
            mapaForn[fNome] = { fornecedor: fNome, totalItens: 0, recebidos: 0, aguardando: 0, faltas: 0, itens: {} };
        }

        mapaForn[fNome].totalItens++;
        if (statusRec === 'recebido') mapaForn[fNome].recebidos++;
        else if (statusRec === 'falta') mapaForn[fNome].faltas++;
        else mapaForn[fNome].aguardando++;

        // Agrupa por produto dentro do fornecedor
        if (!mapaForn[fNome].itens[pNome]) {
            mapaForn[fNome].itens[pNome] = { 
                nome: pNome, 
                unidade: p.unidade_medida || 'UN', 
                status_geral: statusRec, // Se as lojas tiverem status diferentes, a lógica abaixo ajusta
                qtd_total: 0, 
                lojas: [],
                ids_pedidos: [] // Guarda os IDs para atualizar o banco de uma vez
            };
        }

        mapaForn[fNome].itens[pNome].qtd_total += Number(p.qtd_atendida || 0);
        mapaForn[fNome].itens[pNome].ids_pedidos.push(p.id);
        mapaForn[fNome].itens[pNome].lojas.push({
            nome_loja: nomeLoja,
            qtd: Number(p.qtd_atendida || 0),
            status: statusRec
        });

        // Atualiza status geral do item (Se uma loja tá pendente, o item tá pendente visualmente)
        if (statusRec === 'aguardando') mapaForn[fNome].itens[pNome].status_geral = 'aguardando';
      });

      // Transforma em array e ordena
      const arrayFinal = Object.values(mapaForn).map(f => {
          f.itens = Object.values(f.itens).sort((a, b) => a.nome.localeCompare(b.nome));
          return f;
      }).sort((a, b) => a.fornecedor.localeCompare(b.fornecedor));

      setDadosAgrupados(arrayFinal);
      setMetricasGestao({ total: metTotal, recebido: metRecebido, falta: metFalta, aguardando: metAguardando });

    } catch (err) { console.error(err); }
    finally { if (!silencioso) setCarregando(false); }
  }, [hoje]);

  useEffect(() => { 
      carregarDados(); 
      const radar = setInterval(() => carregarDados(true), 15000); // Atualiza a tela de casa a cada 15s
      return () => clearInterval(radar);
  }, [carregarDados]);

  const alternarFornecedor = (fornNome) => {
      setFornecedoresExpandidos(prev => ({ ...prev, [fornNome]: !prev[fornNome] }));
  };

  // 💡 MOTOR DE ATUALIZAÇÃO RÁPIDA (Background Save)
  const registrarRecebimento = (ids_pedidos, novoStatus, fornecedorNome, nomeItem) => {
      // 1. Atualiza a Tela na Hora (Sem loading para o usuário da madrugada)
      setDadosAgrupados(prev => prev.map(f => {
          if (f.fornecedor === fornecedorNome) {
              const novosItens = f.itens.map(i => {
                  if (i.nome === nomeItem) {
                      return { ...i, status_geral: novoStatus, lojas: i.lojas.map(l => ({ ...l, status: novoStatus })) };
                  }
                  return i;
              });
              return { ...f, itens: novosItens };
          }
          return f;
      }));

      // 2. Manda pro banco no fundo
      supabase.from('pedidos')
        .update({ status_recebimento: novoStatus })
        .in('id', ids_pedidos)
        .then(() => carregarDados(true));
  };

  if (carregando && dadosAgrupados.length === 0) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando Conferência...</div>;

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, paddingBottom: '120px', padding: '10px' }}>
      
      {/* HEADER DE COMANDO */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>🔦 CONFERÊNCIA DE MADRUGADA</h2>
            <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Data Base: {dataBr}</p>
          </div>
          <button onClick={() => carregarDados()} style={{background: '#333', border: 'none', color: '#fff', padding: '12px 15px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold'}}>🔄 ATUALIZAR</button>
        </div>
      </div>

      {/* TABS DE NAVEGAÇÃO */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
        <button onClick={() => setAbaAtiva('operacional')} style={{ flex: 1, padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', backgroundColor: abaAtiva === 'operacional' ? configDesign.cores.primaria : '#fff', color: abaAtiva === 'operacional' ? '#fff' : configDesign.geral.corTextoSecundario }}>
          📦 OPERACIONAL (CEASA)
        </button>
        <button onClick={() => setAbaAtiva('painel')} style={{ flex: 1, padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', backgroundColor: abaAtiva === 'painel' ? '#111' : '#fff', color: abaAtiva === 'painel' ? '#fff' : configDesign.geral.corTextoSecundario }}>
          📊 PAINEL GESTÃO (CASA)
        </button>
      </div>

      {/* ========================================================================================= */}
      {/* ABA 1: OPERACIONAL (VISÃO DE QUEM ESTÁ RECEBENDO A MERCADORIA) */}
      {/* ========================================================================================= */}
      {abaAtiva === 'operacional' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: `1px solid ${configDesign.cores.borda}` }}>
            <span>🔍</span><input placeholder="Filtrar fornecedor ou item..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          {dadosAgrupados.filter(f => f.fornecedor.toLowerCase().includes(busca.toLowerCase()) || f.itens.some(i => i.nome.toLowerCase().includes(busca.toLowerCase()))).map(f => {
             const isExpandido = fornecedoresExpandidos[f.fornecedor];
             
             // Filtra apenas os itens que estão aguardando (esconde os já recebidos para limpar a tela)
             const itensAguardando = f.itens.filter(i => i.status_geral === 'aguardando' && i.nome.toLowerCase().includes(busca.toLowerCase()));
             
             if (itensAguardando.length === 0 && !busca) return null; // Se o fornecedor já foi todo recebido, esconde ele.

             return (
                <div key={f.fornecedor} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: configDesign.geral.sombraSuave, borderTop: `5px solid ${configDesign.cores.primaria}` }}>
                   
                   <div onClick={() => alternarFornecedor(f.fornecedor)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <h3 style={{ margin: 0, color: '#111', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🚚 {f.fornecedor} 
                        <span style={{background: '#fefce8', color: '#b45309', fontSize: '11px', padding: '3px 8px', borderRadius: '8px'}}>{itensAguardando.length} pendentes</span>
                      </h3>
                      <span style={{ color: '#ccc', transform: isExpandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                   </div>

                   {isExpandido && (
                     <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {itensAguardando.map(item => (
                           <div key={item.nome} style={{ background: '#f8fafc', border: `1px solid ${configDesign.cores.borda}`, borderRadius: '12px', padding: '15px' }}>
                              
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                 <strong style={{ fontSize: '16px', color: '#111' }}>{formatarNomeItem(item.nome)}</strong>
                                 <span style={{ background: '#111', color: '#fff', padding: '5px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '15px' }}>
                                    {item.qtd_total} <small style={{fontSize:'10px', color: '#aaa'}}>{item.unidade}</small>
                                 </span>
                              </div>

                              {/* 💡 SEPARAÇÃO POR LOJA (Mostra pra onde vai cada caixa) */}
                              {item.lojas.length > 1 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '15px' }}>
                                    {item.lojas.map((loja, idx) => (
                                        <span key={idx} style={{ background: '#e2e8f0', color: '#334155', fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px' }}>
                                            {loja.nome_loja}: {loja.qtd}
                                        </span>
                                    ))}
                                </div>
                              )}

                              {/* BOTÕES DE AÇÃO GIGANTES */}
                              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                 <button onClick={() => registrarRecebimento(item.ids_pedidos, 'recebido', f.fornecedor, item.nome)} style={{ flex: 2, background: configDesign.cores.sucesso, color: '#fff', border: 'none', padding: '15px', borderRadius: '12px', fontWeight: '900', fontSize: '14px', cursor: 'pointer' }}>
                                    ✅ CHEGOU TUDO
                                 </button>
                                 <button onClick={() => registrarRecebimento(item.ids_pedidos, 'falta', f.fornecedor, item.nome)} style={{ flex: 1, background: '#fef2f2', color: configDesign.cores.alerta, border: `1px solid ${configDesign.cores.alerta}`, padding: '15px', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}>
                                    ❌ FALTOU
                                 </button>
                              </div>

                           </div>
                        ))}
                     </div>
                   )}
                </div>
             );
          })}
          {dadosAgrupados.every(f => f.itens.every(i => i.status_geral !== 'aguardando')) && (
             <div style={{ textAlign: 'center', padding: '40px', color: configDesign.cores.sucesso, backgroundColor: '#fff', borderRadius: '20px', fontWeight: '900', fontSize: '18px' }}>
                 🎉 TUDO RECEBIDO! GALPÃO LIMPO!
             </div>
          )}
        </div>
      )}

      {/* ========================================================================================= */}
      {/* ABA 2: PAINEL DE GESTÃO (VISÃO DE QUEM ESTÁ EM CASA) */}
      {/* ========================================================================================= */}
      {abaAtiva === 'painel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
           
           {/* CARDS DE MÉTRICAS */}
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: '4px solid #111' }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>TOTAL ESPERADO</span>
                 <strong style={{ fontSize: '28px', color: '#111' }}>{metricasGestao.total}</strong>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: `4px solid ${configDesign.cores.sucesso}` }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>RECEBIDOS</span>
                 <strong style={{ fontSize: '28px', color: configDesign.cores.sucesso }}>{metricasGestao.recebido}</strong>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: `4px solid ${configDesign.cores.alerta}` }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>FALTAS RELATADAS</span>
                 <strong style={{ fontSize: '28px', color: configDesign.cores.alerta }}>{metricasGestao.falta}</strong>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: '4px solid #eab308' }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>A CHEGAR</span>
                 <strong style={{ fontSize: '28px', color: '#b45309' }}>{metricasGestao.aguardando}</strong>
              </div>
           </div>

           {/* LISTA DE PROBLEMAS (FALTAS) */}
           {metricasGestao.falta > 0 && (
             <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.alerta}` }}>
                <h3 style={{ margin: '0 0 15px 0', color: configDesign.cores.alerta, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  🚨 FALTAS INFORMADAS PELO GALPÃO
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   {dadosAgrupados.map(f => f.itens.filter(i => i.status_geral === 'falta').map(item => (
                      <div key={item.nome} style={{ background: '#fff', padding: '10px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>
                         <span>{formatarNomeItem(item.nome)} ({item.qtd_total} {item.unidade})</span>
                         <span style={{ fontSize: '10px', color: '#ef4444' }}>Forn: {f.fornecedor}</span>
                      </div>
                   )))}
                </div>
             </div>
           )}

           {/* PROGRESSO POR FORNECEDOR */}
           <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#111', fontSize: '16px' }}>Status por Fornecedor</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                 {dadosAgrupados.map(f => {
                    const pctRecebido = Math.round((f.recebidos / f.totalItens) * 100) || 0;
                    let corBarra = '#3b82f6';
                    if (pctRecebido === 100 && f.faltas === 0) corBarra = configDesign.cores.sucesso;
                    if (f.faltas > 0) corBarra = configDesign.cores.alerta;

                    return (
                       <div key={f.fornecedor}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                             <span style={{color: '#111'}}>{f.fornecedor}</span>
                             <span style={{color: corBarra}}>{pctRecebido}% ({f.recebidos}/{f.totalItens})</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                             <div style={{ width: `${pctRecebido}%`, height: '100%', background: corBarra, transition: 'width 0.5s' }}></div>
                          </div>
                       </div>
                    );
                 })}
              </div>
           </div>

        </div>
      )}

    </div>
  );
}
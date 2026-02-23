import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function Marketing() {
  const configDesign = {
    geral: {
      fontePadrao: "'Inter', sans-serif",
      raioBordaGlobal: '20px',
      sombraSuave: '0 8px 30px rgba(0,0,0,0.04)',
      corTextoPrincipal: '#111111',
      corTextoSecundario: '#64748b',
      corFundoTela: '#f5f5f4'
    },
    botoes: {
      destaque: '#f97316', 
      perigo: '#ef4444',   
      textoCor: '#ffffff',
      raio: '12px'
    }
  };

  const [banners, setBanners] = useState([]);
  const [fazendoUpload, setFazendoUpload] = useState(null);

  async function carregarBanners() {
    const { data } = await supabase.from('banners').select('*').order('id', { ascending: true });
    if (data) setBanners(data);
  }

  useEffect(() => { carregarBanners(); }, []);

  async function uploadBanner(event, bannerId) {
    const file = event.target.files[0];
    if (!file) return;

    setFazendoUpload(bannerId);
    const fileExt = file.name.split('.').pop();
    const fileName = `banner_${bannerId}_${Date.now()}.${fileExt}`;
    const filePath = `banners/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('frazao-midia').upload(filePath, file);

    if (uploadError) {
      setFazendoUpload(null);
      return alert("Erro ao subir banner: " + uploadError.message);
    }

    const { data } = supabase.storage.from('frazao-midia').getPublicUrl(filePath);
    
    await supabase.from('banners').update({ imagem_url: data.publicUrl }).eq('id', bannerId);
    carregarBanners();
    setFazendoUpload(null);
  }

  async function removerBanner(bannerId) {
    if(window.confirm("Remover esta imagem do aplicativo?")) {
      await supabase.from('banners').update({ imagem_url: '' }).eq('id', bannerId);
      carregarBanners();
    }
  }

  const getEstiloPreview = (posicao) => {
    if (posicao === 'logo') return { width: '120px', height: '120px', borderRadius: '50%', margin: '0 auto' };
    return { width: '100%', height: '160px', borderRadius: '12px', margin: '0' }; 
  };

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, paddingBottom: '100px' }}>
      
      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: configDesign.geral.raioBordaGlobal, color: 'white', marginBottom: '20px', boxShadow: configDesign.geral.sombraSuave }}>
        <h2 style={{ margin: 0, fontWeight: '900' }}>🖼️ MARKETING & BANNERS</h2>
        <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>Gerencie a vitrine do aplicativo do cliente. Eles atualizam em tempo real.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {banners.map(b => (
          <div key={b.id} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: configDesign.geral.raioBordaGlobal, boxShadow: configDesign.geral.sombraSuave, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: 0, color: configDesign.botoes.destaque, fontWeight: '900', fontSize: '15px' }}>{b.titulo}</h3>
                <p style={{ margin: 0, fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>Ideal: {b.tamanho_recomendado}</p>
              </div>
              {b.imagem_url && (
                <button onClick={() => removerBanner(b.id)} style={{ background: '#fef2f2', color: configDesign.botoes.perigo, border: 'none', padding: '5px 10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', height: 'fit-content' }}>
                  🗑️
                </button>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {fazendoUpload === b.id ? (
                <div style={{ ...getEstiloPreview(b.posicao), backgroundColor: '#f1f5f9', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', color: configDesign.geral.corTextoSecundario }}>⏳ Enviando...</div>
              ) : b.imagem_url ? (
                <div style={{ ...getEstiloPreview(b.posicao), backgroundImage: `url(${b.imagem_url})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid #e2e8f0' }} />
              ) : (
                <div style={{ ...getEstiloPreview(b.posicao), backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '10px', position: 'relative', overflow: 'hidden' }}>
                  <span style={{ fontSize: '24px' }}>📸</span>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>Toque para subir</span>
                  <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={(e) => uploadBanner(e, b.id)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
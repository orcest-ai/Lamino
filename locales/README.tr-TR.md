<a name="readme-top"></a>

<p align="center">
  <h1 align="center">Lamino</h1>
  <p align="center"><b>Akilli LLM Calisma Alani</b> — Orcest AI Ekosisteminin Parcasi</p>
</p>

<p align="center">
  <a href="https://llm.orcest.ai">Canli Ornek</a> |
  <a href="https://orcest.ai">Orcest AI</a> |
  <a href="../LICENSE">Lisans (MIT)</a>
</p>

Herhangi bir belgeyi, kaynagi veya icerigi sohbet sirasinda herhangi bir LLM in referans olarak kullanabilecegi bir baglama donusturmenizi saglayan tam kapsamli bir uygulama. Lamino, ucretsiz, dahili ve premium saglayicilar arasinda otomatik yonlendirme ile akilli LLM yonlendirmesi icin **RainyModel** (rm.orcest.ai) ile entegredir.

### Orcest AI Ekosistemi

| Hizmet | Alan Adi | Rol |
|---------|--------|------|
| **Lamino** | llm.orcest.ai | LLM Calisma Alani |
| **RainyModel** | rm.orcest.ai | LLM Yonlendirme Proxy |
| **Maestrist** | agent.orcest.ai | AI Ajan Platformu |
| **Orcide** | ide.orcest.ai | Bulut IDE |
| **Login** | login.orcest.ai | SSO Kimlik Dogrulama |

## Ozellikler

- Tam MCP uyumlulugu
- Kodsuz AI Ajan olusturucu
- Coklu-mod destegi (hem kapali hem acik kaynakli LLM ler)
- Ozel AI Ajanlari
- Cok kullanicili destek ve yetkilendirme (Docker surumu)
- Surukle-birak islevine sahip basit sohbet arayuzu
- %100 bulut dagitima hazir
- Tum populer LLM saglayicilariyla uyumlu
- Akilli LLM yonlendirmesi icin **RainyModel** destegi

## Kendi Sunucunuzda Barinma

Lamino, Docker veya bare metal ile dagitilabilir. Docker disinda kurulum icin [BARE_METAL.md](../BARE_METAL.md) dosyasina bakin.

## Gelistirme Icin Kurulum

- `yarn setup` Her uygulama bolumu icin gerekli `.env` dosyalarini olusturur.
- `yarn dev:server` Sunucuyu yerel olarak baslatir.
- `yarn dev:frontend` On yuzu yerel olarak calistirir.
- `yarn dev:collector` Belge toplayiciyi calistirir.

## Katki

Katki yonergeleri icin [CONTRIBUTING.md](../CONTRIBUTING.md) dosyasina bakin.

---

Bu proje [MIT](../LICENSE) lisansi ile lisanslanmistir.

[Orcest AI](https://orcest.ai) ekosisteminin parcasidir.

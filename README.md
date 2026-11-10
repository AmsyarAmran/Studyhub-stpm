# STUDYHUB STPM

Laman web statik percuma untuk GitHub Pages.

## Terbitkan melalui GitHub
1. Log masuk ke GitHub dan tekan **New repository**.
2. Namakan repositori `studyhub-stpm`.
3. Pilih **Public**, kemudian cipta repositori.
4. Tekan **Add file → Upload files** dan muat naik `index.html`.
5. Tekan **Commit changes**.
6. Buka **Settings → Pages**.
7. Di bahagian **Build and deployment**, pilih **Deploy from a branch**.
8. Pilih branch `main` dan folder `/ (root)`, kemudian tekan **Save**.
9. Tunggu seketika. Pautan laman akan muncul di halaman Pages.

## Tambah bahan soalan
Buka `index.html`, cari `const papers = [` dan tambah objek mengikut format ini:

```js
{state:"Kelantan", subject:"PAM", year:"2026", semester:"Sem 1", title:"Kertas Percubaan", url:"PAUTAN_PDF_SEBENAR"}
```

Nilai `subject` mestilah `PAM`, `KMK`, `SENI` atau `BM`. Tahun mestilah `2026` atau `2027`.
Pastikan pautan PDF/Google Drive benar-benar boleh dibuka dan anda mempunyai kebenaran untuk berkongsinya.

## Countdown
Tarikh peperiksaan rasmi belum dimasukkan kerana perlu disahkan dahulu. Selepas tarikh diketahui, fungsi countdown boleh ditambah dengan tepat.

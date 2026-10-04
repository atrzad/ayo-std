// Envio de e-mail (confirmação de conta e de troca de e-mail) por SMTP do .env.
// Sem SMTP configurado, nada é enviado: o link vai para o log do serviço e o dono pode confirmar a conta à mão.
import nodemailer from 'nodemailer';

const env = process.env;
const configurado = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
const transporte = configurado
  ? nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORTA || 465),
    secure: Number(env.SMTP_PORTA || 465) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  : null;

export const emailConfigurado = () => configurado;
export const urlPublica = () => (env.URL_PUBLICA || 'http://localhost:3300').replace(/\/$/, '');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function enviarConfirmacao({ para, nome, token, motivo = 'conta' }) {
  const link = `${urlPublica()}/confirmar-email/${token}`;
  const assunto = motivo === 'conta' ? 'Confirme sua conta no Ayo Std' : 'Confirme seu novo e-mail no Ayo Std';
  const texto = `Olá, ${nome}!\n\n${motivo === 'conta' ? 'Para ativar sua conta' : 'Para confirmar este e-mail'} no Ayo Std, abra o link abaixo (vale por 24 horas):\n\n${link}\n\nSe não foi você, ignore esta mensagem.`;
  if (!transporte) {
    console.log(`[email] SMTP não configurado. Link de confirmação para ${para}: ${link}`);
    return false;
  }
  try {
    await transporte.sendMail({
      from: env.SMTP_DE || env.SMTP_USER,
      to: para,
      subject: assunto,
      text: texto,
      html: `<p>Olá, ${esc(nome)}!</p><p>${motivo === 'conta' ? 'Para ativar sua conta' : 'Para confirmar este e-mail'} no Ayo Std, clique no botão (vale por 24 horas):</p>
        <p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;background:#a3531c;color:#fff;text-decoration:none;border-radius:6px">Confirmar e-mail</a></p>
        <p style="color:#666;font-size:13px">Se o botão não funcionar, copie este endereço: ${esc(link)}<br>Se não foi você, ignore esta mensagem.</p>`,
    });
    return true;
  } catch (e) {
    console.error('[email] falha no envio:', e.message);
    return false;
  }
}

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email con código OTP de 6 dígitos
const enviarOTP = async (email, codigo, nombre) => {
  await transporter.sendMail({
    from: `"ARIA - Rescate Animal" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verifica tu cuenta ARIA',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc;border-radius:16px;">
        <div style="background:#2563eb;border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem;">
          <h1 style="color:white;margin:0;font-size:1.5rem;font-weight:800;letter-spacing:2px;">ARIA</h1>
          <p style="color:rgba(255,255,255,0.8);margin:0.25rem 0 0;font-size:0.875rem;">Plataforma de Rescate Animal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #e2e8f0;">
          <h2 style="color:#0f172a;margin:0 0 0.75rem;font-size:1.1rem;">Hola, ${nombre}</h2>
          <p style="color:#475569;margin:0 0 1.25rem;line-height:1.6;font-size:0.875rem;">
            Tu codigo de verificacion es:
          </p>
          <div style="background:#eff6ff;border:2px dashed #bfdbfe;border-radius:12px;padding:1.25rem;text-align:center;margin-bottom:1.25rem;">
            <span style="font-size:2.25rem;font-weight:800;color:#2563eb;letter-spacing:0.5rem;">${codigo}</span>
          </div>
          <p style="color:#94a3b8;font-size:0.78rem;margin:0;text-align:center;">
            Este codigo expira en 15 minutos.
          </p>
        </div>
        <p style="color:#94a3b8;font-size:0.75rem;text-align:center;margin-top:1rem;">
          Si no creaste esta cuenta, ignora este correo.
        </p>
      </div>
    `
  });
};

// Email con Magic Link (auto-login)
const enviarMagicLink = async (email, nombre, enlaceVerificacion) => {
  await transporter.sendMail({
    from: `"ARIA - Rescate Animal" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Activa tu cuenta ARIA',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc;border-radius:16px;">
        <div style="background:#2563eb;border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem;">
          <h1 style="color:white;margin:0;font-size:1.5rem;font-weight:800;letter-spacing:2px;">ARIA</h1>
          <p style="color:rgba(255,255,255,0.8);margin:0.25rem 0 0;font-size:0.875rem;">Plataforma de Rescate Animal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #e2e8f0;">
          <h2 style="color:#0f172a;margin:0 0 0.75rem;font-size:1.1rem;">Bienvenido, ${nombre}</h2>
          <p style="color:#475569;margin:0 0 1.5rem;line-height:1.6;font-size:0.875rem;">
            Tu cuenta ha sido creada exitosamente. Haz clic en el boton para verificar tu correo e ingresar directamente a la plataforma.
          </p>
          <div style="text-align:center;margin-bottom:1.25rem;">
            <a href="${enlaceVerificacion}" 
               style="display:inline-block;background:#2563eb;color:white;padding:0.875rem 2rem;border-radius:12px;text-decoration:none;font-weight:700;font-size:1rem;">
              Verificar mi cuenta
            </a>
          </div>
          <p style="color:#94a3b8;font-size:0.75rem;margin:0;text-align:center;">
            Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este correo.
          </p>
        </div>
      </div>
    `
  });
};

// Email de recuperación de contraseña con OTP
const enviarOTPRecuperacion = async (email, nombre, codigo) => {
  await transporter.sendMail({
    from: `"ARIA - Rescate Animal" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Recupera tu contrasena - ARIA',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f8fafc;border-radius:16px;">
        <div style="background:#2563eb;border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem;">
          <h1 style="color:white;margin:0;font-size:1.5rem;font-weight:800;letter-spacing:2px;">ARIA</h1>
          <p style="color:rgba(255,255,255,0.8);margin:0.25rem 0 0;font-size:0.875rem;">Plataforma de Rescate Animal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #e2e8f0;">
          <h2 style="color:#0f172a;margin:0 0 0.75rem;font-size:1.1rem;">Hola, ${nombre}</h2>
          <p style="color:#475569;margin:0 0 1.25rem;line-height:1.6;font-size:0.875rem;">
            Tu codigo para restablecer la contrasena es:
          </p>
          <div style="background:#eff6ff;border:2px dashed #bfdbfe;border-radius:12px;padding:1.25rem;text-align:center;margin-bottom:1.25rem;">
            <span style="font-size:2.25rem;font-weight:800;color:#2563eb;letter-spacing:0.5rem;">${codigo}</span>
          </div>
          <p style="color:#94a3b8;font-size:0.78rem;margin:0;text-align:center;">
            Este codigo expira en 15 minutos.
          </p>
        </div>
        <p style="color:#94a3b8;font-size:0.75rem;text-align:center;margin-top:1rem;">
          Si no solicitaste esto, ignora este correo.
        </p>
      </div>
    `
  });
};

module.exports = { enviarOTP, enviarMagicLink, enviarOTPRecuperacion };

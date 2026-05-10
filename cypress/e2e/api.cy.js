describe('ARIA Backend - Pruebas API', () => {

  it('El servidor responde correctamente', () => {
    cy.request('GET', '/').then(resp => {
      expect(resp.status).to.eq(200)
    })
  })

  it('Login con credenciales incorrectas devuelve 401 o 404', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'noexiste@test.com', contrasena: 'incorrecta' },
      failOnStatusCode: false
    }).then(resp => {
      expect(resp.status).to.be.oneOf([401, 404])
    })
  })

  it('Registro sin datos devuelve error', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: {},
      failOnStatusCode: false
    }).then(resp => {
      expect(resp.status).to.be.oneOf([400, 500])
    })
  })

  it('Acceder a reportes sin token devuelve 401', () => {
    cy.request({
      method: 'GET',
      url: '/api/reportes',
      failOnStatusCode: false
    }).then(resp => {
      expect(resp.status).to.eq(401)
    })
  })

  it('Acceder a admin sin token devuelve 401 o 403', () => {
    cy.request({
      method: 'GET',
      url: '/api/admin/entidades-pendientes',
      failOnStatusCode: false
    }).then(resp => {
      expect(resp.status).to.be.oneOf([401, 403])
    })
  })

})

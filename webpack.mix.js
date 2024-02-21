require('dotenv').config()

const mix = require('laravel-mix')

mix
  .setPublicPath('src/assets')
  .disableNotifications()
  .sass('src/styles/app.scss', 'app.css')

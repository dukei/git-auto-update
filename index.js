const online = require('is-online')
const request = require('request')
const chalk = require('chalk')
const semver = require('semver')
const osFamily = require('os-family')
const fs = require('fs')
const ProgressBar = require('progress')
const path = require('path')
const unzip = require('unzipper')
const untar = require('tar-pack').unpack
const _ = require('lodash')

async function update ({ url, token, version, useMaster = false, regex: { windowsRegex = /-windows-/, linuxRegex = /-linux-/ } }) {
  if (await online()) {
    // add access token if specified
    if (token) {
      url = url.concat(`?access_token=${token}`)
    }
    // check for updates
    request.get({ url, headers: { 'User-Agent': 'git-auto-update' } }, async (error, response, body) => {
      if (!error && response.statusCode === 200) {
        body = JSON.parse(body)
        if (checkNeedForUpdate(body, version)) {
          // update if necesarry
          if (_.has(body, 'assets') && !useMaster) {
            var downloadLink = false
            if (osFamily.linux) {
              downloadLink = parseDownloadLink(body, linuxRegex, useMaster)
            } else if (osFamily.win) {
              downloadLink = parseDownloadLink(body, windowsRegex, useMaster)
            }
            if (downloadLink) {
              // download the file
              await downloadFile(downloadLink.link, downloadLink.name, token)
              if (path.extname(downloadLink.name) === '.gz' || path.extname(downloadLink.name) === '.tar') {
                // extract from tar ball or gzip
                console.log(chalk.green(`Extracting ${path.extname(downloadLink.name) === 'gz' ? 'gzip' : 'tarball'} file...`))
                // fs.createReadStream(getAbsPath(downloadLink.name)).pipe(untar(getAbsPath('./'), function (err) {
                  // if (err) console.error(err.stack)
                  // else console.log('done')
                // }))
              } else if (path.extname(downloadLink.name) === '.zip') {
                // extract from zip file
                console.log(chalk.green('Extracting zip file...'))
                // fs.createReadStream(downloadLink.name).pipe(unzip.Extract({ path: './' }))
              }
            } else {
              console.error(chalk.red('There is no download for the latest version of the software for this operating system.'))
            }
          }
        }
      } else {
        console.error(chalk.red('Can not reach the backend for updates.'))
      }
    })
  } else {
    console.error(chalk.red('Not connected to internet, can not check for updates.'))
  }
}

function checkNeedForUpdate (data, version) {
  if (_.has(data, 'tag_name')) {
    const latestVersion = semver.coerce(data.tag_name)
    version = semver.coerce(version)
    if (semver.valid(latestVersion) && semver.valid(version)) {
      const result = semver.gt(latestVersion, version)
      if (result) {
        console.log(chalk.yellow(`Found new update... v${latestVersion.version} > v${version.version}`))
      }
      return result
    } else {
      console.error(chalk.red('Semantic versioning is not valid. Cancelling update.'))
    }
  } else {
    console.error(chalk.red('API did not respond with a valid release tag.'))
    return false
  }
}

function parseDownloadLink (body, regex, useMaster) {
  var link, name
  if (!useMaster) {
    body.assets.forEach(async asset => {
      if (_.has(asset, 'name')) {
        if (asset.name.match(regex)) {
          if (_.has(asset, 'browser_download_url')) {
            link = asset.browser_download_url
            name = asset.name
          } else {
            console.error(chalk.red('Download URL can not be found for update.'))
          }
        }
      } else {
        console.error(chalk.red('Can not match the version with the latest release name. Incompatible response from update server. Asset must have a name.'))
      }
    })
  } else {
    link = body.zipball_url || body.tarball_url
    name = `auto-update_${body.tag_name}.${body.zipball_url ? '.zip' : '.tar.gz'}`
  }
  return { link, name } || false
}

function downloadFile (link, name, token) {
  return new Promise((resolve) => {
    request({ url: link, headers: { 'User-Agent': 'git-auto-update', Authorization: `token ${token}`, Accept: 'application/octet-stream' } })
      .on('response', response => {
        if (response.statusCode === 200) {
          if (_.has(response, ['headers', 'content-length'])) {
            var downloadProgressBar = new ProgressBar(chalk.green('|:bar| Downloading update > :percent, complete in :etas'), { total: parseInt(response.headers['content-length']), complete: '█', incomplete: ' ', width: 100 })
            response.on('data', data => {
              downloadProgressBar.tick(parseInt(data.length))
            })
          } else {
            console.log(chalk.green('Downloading update...'))
          }
          response.pipe(fs.createWriteStream(name))
        }
      })
      .on('error', err => {
        console.error(chalk.red(err))
      })
      .on('end', () => resolve(true))
  })
}

function getAbsPath (relPath) {
  if (typeof process.pkg === 'undefined') {
    return path.resolve(process.cwd(), relPath)
  } else {
    return path.resolve(path.dirname(process.execPath), relPath)
  }
}


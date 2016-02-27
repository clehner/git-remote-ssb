var test = require('tape')
var path = require('path')
var rimraf = require('rimraf')
var fs = require('fs')
var os = require('os')
var ssbKeys = require('ssb-keys')
var cp = require('child_process')

function randstr() {
  return Math.random().toString(36).substr(2)
}

var createSbot = require('scuttlebot')
  .use(require('scuttlebot/plugins/master'))
  .use(require('scuttlebot/plugins/blobs'))
  .use(require('scuttlebot/plugins/friends'))

var appName = 'git_ssb_test_' + randstr()
var sbotPath = path.join(os.tmpdir(), appName)
var sbotPort = 45400 + ~~(Math.random()*100)
var repoPath = path.join(os.tmpdir(), 'ssb-git-repo-' + randstr())
// Set path explicitly so we won't risk leaving temp dotfiles in the user's
// home directory.
process.env.ssb_path = sbotPath
process.env.ssb_appname = appName
process.env[appName + '_port'] = sbotPort

var sbot = createSbot({
  path: sbotPath,
  port: sbotPort,
  timeout: 200,
  allowPrivate: true,
  keys: ssbKeys.loadOrCreateSync(path.join(sbotPath, 'secret'))
})

fs.writeFileSync(path.join(sbotPath, 'manifest.json'),
  JSON.stringify(sbot.getManifest()))

test.onFinish(function () {
  sbot.close(true, function (err) {
    rimraf.sync(sbotPath)
    rimraf.sync(repoPath)
    if (err) throw err
  })
})

var srcPath = path.dirname(__filename)
var cwd = process.cwd()

function git() {
  var args = [].concat.apply([], arguments)
  var doneCb = args.pop()
  cp.spawn('git', args, {
    stdio: ['ignore', process.stderr, process.stderr],
    cwd: cwd
  }).on('close', doneCb)
}

var url

test('create ssb git-repo', function (t) {
  sbot.publish({ type: 'git-repo' }, function (err, msg) {
    t.error(err, 'publish git-repo message')
    url = 'ssb://' + msg.key
    t.end()
  })
})

test('clone empty repo', function (t) {
  git('clone', url, repoPath, function (ret) {
    t.error(ret, 'git clone')
    t.end()
  })
})

test('push package repo to the remote', function (t) {
  // TODO: use something other than the project repo
  cwd = srcPath
  git('push', '-q', url, 'master', function (ret) {
    t.error(ret, 'git push')
    t.end()
  })
})

test('pull from the remote', function (t) {
  cwd = repoPath
  git('pull', '-q', url, 'master', function (ret) {
    t.error(ret, 'git pull')
    t.end()
  })
})

test('make a commit and push it', function (t) {
  cwd = repoPath
  var newdir = randstr()
  var filenames = [randstr(), randstr(), path.join(newdir, randstr())]
  fs.mkdirSync(path.join(repoPath, newdir))
  filenames.forEach(function (filename) {
    fs.writeFileSync(path.join(repoPath, filename), randstr())
  })
  git('add', filenames, function (ret) {
    t.error(ret, 'git add')
    git('commit', '-am', 'Add some files', function (ret) {
      t.error(ret, 'git push')
      git('push', url, 'master', function (ret) {
        t.error(ret, 'git push')
        t.end()
      })
    })
  })
})

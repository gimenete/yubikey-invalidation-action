// This code is mainly based on https://github.com/hubot-scripts/hubot-yubikey-invalidation/blob/master/src/yubikey-invalidation.coffee
const core = require('@actions/core');
const github = require('@actions/github');
const crypto = require('crypto');
const https = require('https');

const charset = "cbdefghijklnrtuv";
const otpRegex = new RegExp(`(cccccc[${charset}]{38})`);
const dvorakCharset = "jxe.uidchtnbpygk";
const dvorakOtpRegex = new RegExp(`(jjjjjj[${dvorakCharset}]{38})`);
const messagePrefix = 'Was that your YubiKey?';

const defaultValidationUrl = 'https://api.yubico.com/wsapi/2.0/verify';
const text = core.getInput('text');
const apiId = core.getInput('YUBIKEY_API_ID');
const validationUrl = core.getInput('validation_url') || defaultValidationUrl;
const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
const payload = core.getInput('payload');

function invalidateOtp(otp) {
  core.setOutput('found', 'true');

  const nonce = crypto.pseudoRandomBytes(16).toString('hex')
  https.get(`${validationUrl}?id=${apiId}&otp=${otp}&nonce=${nonce}`, function(res) {
    const invalidated = res.statusCode === 200
    const message = invalidated
      ? `${messagePrefix} I went ahead and invalidated that OTP for you 🔒`
      : `${messagePrefix} I tried to invalidate that OTP for you, but I got a ${res.statusCode} error from the server 😢`
    core.setOutput('message', message);
    core.setOutput('invalidated', String(invalidated));

    if (payload && GITHUB_TOKEN) {
      const octokit = new github.GitHub(GITHUB_TOKEN);
      const { repository: { owner: { login: owner }, name: repo }, issue: { number: issue_number } } = JSON.parse(payload)
      octokit.issues.createComment({
        owner,
        repo,
        issue_number,
        body: message,
      })
    }
})
}

function invalidateDvorakOtp(msg, dvorakOtp) {
  let i, j, otp, ref;
  otp = dvorakOtp;
  for (i = j = 0, ref = dvorakCharset.length; (0 <= ref ? j <= ref : j >= ref); i = 0 <= ref ? ++j : --j) {
    otp = otp.replace(dvorakCharset[i], charset[i]);
  }
  return invalidateOtp(msg, otp);
}

core.setOutput('found', 'false');
core.setOutput('invalidated', 'false');

try {
  const otpMatch = text.match(otpRegex)
  const dvorakOtpMatch = text.match(dvorakOtpRegex)

  if (otpMatch) {
    invalidateOtp(otpMatch[0])
  }
  if (dvorakOtpMatch) {
    invalidateDvorakOtp(dvorakOtpMatch[0])
  }
} catch (error) {
  core.setFailed(error.message);
}

// shamelessly copied from reactiflux/discord-irc

const ircFormatting = require('irc-formatting');
const SimpleMarkdown = require('./PatchedSimpleMarkdown.js');
const colors = require('irc-colors');

function mdNodeToIRC(node) {
  let { content } = node;
  if (Array.isArray(content)) content = content.map(mdNodeToIRC).join('');
  switch (node.type) {
    case 'em':
      return colors.italic(content);
    case 'strong':
      return colors.bold(content);
    case 'u':
      return colors.underline(content);
    case 'del':
      return `~~${content}~~`;
    case 'spoiler':
      const c = '\x03';
      return `${c}01,01${content}${c}`;
    default:
      return content;
  }
}

function formatFromDiscordToIRC(text) {
  text = text.replace('¯\\_(ツ)_/¯', '¯\\\\\\_(ツ)_/¯');
  const markdownAST = SimpleMarkdown.defaultInlineParse(text);
  return markdownAST.map(mdNodeToIRC).join('');
}

function formatFromIRCToDiscord(text) {
  const blocks = ircFormatting.parse(text).map(block => ({
    // Consider reverse as italic, some IRC clients use that
    ...block,
    italic: block.italic || block.reverse
  }));
  let mdText = '';

  for (let i = 0; i <= blocks.length; i += 1) {
    // Default to unstyled blocks when index out of range
    const block = blocks[i] || {};
    const prevBlock = blocks[i - 1] || {};

    // Add start markers when style turns from false to true
    if (!prevBlock.italic && block.italic) mdText += '*';
    if (!prevBlock.bold && block.bold) mdText += '**';
    if (!prevBlock.underline && block.underline) mdText += '__';

    // Add end markers when style turns from true to false
    // (and apply in reverse order to maintain nesting)
    if (prevBlock.underline && !block.underline) mdText += '__';
    if (prevBlock.bold && !block.bold) mdText += '**';
    if (prevBlock.italic && !block.italic) mdText += '*';

    mdText += block.text || '';
  }

  return mdText;
}

module.exports = {
  formatFromDiscordToIRC: formatFromDiscordToIRC,
  formatFromIRCToDiscord: formatFromIRCToDiscord,
};

import * as assert from 'assert'
import * as vscode from 'vscode'

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting all tests.')

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('thedaviddias.llms-txt-extension'))
  })

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('thedaviddias.llms-txt-extension')
    if (!extension) {
      assert.fail('Extension not found')
      return
    }

    await extension.activate()
    assert.strictEqual(extension.isActive, true)
  })
})

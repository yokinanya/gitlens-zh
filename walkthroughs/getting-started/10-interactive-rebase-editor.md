## 可视化交互式变基

<p align="center">
  <img src="../../images/docs/rebase.gif" alt="交互式变基编辑器"/>
</p>

只需拖放即可调整提交顺序，并选择你希望编辑、压缩或丢弃的提交。

若你想在终端中直接使用它，例如执行 `git rebase -i` 时，可按下面方式配置：

1. 将 VS Code 设为默认 Git 编辑器：

```sh
git config --global core.editor "code --wait"
```

2. 或者只影响 rebase，将 VS Code 设为 Git 的 rebase 编辑器：

```sh
git config --global sequence.editor "code --wait"
```

> 如果使用 VS Code Insiders，请把上面的 `code` 替换为 `code-insiders`

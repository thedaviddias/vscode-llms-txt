Build a vs code extension (called llms-txt-extension) in this folder that parses https://raw.githubusercontent.com/thedaviddias/llms-txt-hub/refs/heads/main/data/websites.json which is an array of objects that contains the following fields:

- name
- domain
- description
- llmsUrl
- llmsFullUrl
- category
- favicon

The extension would have the goal to:
- allow people to easily copy the llmsUrl URL and llmsFullUrl to their clipboard
- easily view the content of those text files in a new tab
- search for specific websites by name, domain, or description

This extension needs to be using the latest version of the vscode api, be performant and easy to use.
Files needs to be small and organized to help the developer to maintain it.

Document everything about the extension in the README.md file and create scripts that would allow to easily incorportate this extension in my vscode and debug it.

Feel free to check successful extensions that do similar things to get inspiration.


We may want to have different panels:
- one focused on the list of websites by category with a search bar to filter them
- another one to show the favourites websites
- another one for "help and feedbacks"
 - Provide feedback link to x
 - Review issues
 - Report issue
 - Support to my github sponsor page


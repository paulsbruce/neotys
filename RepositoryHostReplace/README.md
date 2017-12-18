#Repository Host Replace
===================


Remove unnecessary server duplicates from NeoLoad project; occurs when original
 server value is replaced with a variable, subsequent recordings re-capture the
 server host name into a new server.

> **Usage:**

> npm install
> node HostReplace.js --repositoryFilepath ~/neoload_projects/YourProject/config/repository.xml
>                     --hostFind someserver.yourdomain.com
> [optional]          --hostReplaceWith someotherserver.yourdomain.com


----------

Minus the optional parameter, this script will find all references to
 'someserver.yourdomain.com_1' and replace them with the existing server that
 matches the same domain (will error early if none exists). With the optional
 parameter, will do the same as above, but replace with another host name that
 you specify (will error early if not present).

----------

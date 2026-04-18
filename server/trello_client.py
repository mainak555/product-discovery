"""
Pure Trello REST API client — no Django imports.

Every function takes (api_key, token) plus endpoint-specific params.
All responses are simplified dicts; errors raise ValueError.
"""

import requests

TRELLO_API = "https://api.trello.com/1"


def _auth_params(api_key, token):
    """Return the common auth query parameters."""
    return {"key": api_key, "token": token}


def _check(resp, action):
    """Raise ValueError with a clear message on non-2xx."""
    if not resp.ok:
        detail = resp.text[:200] if resp.text else resp.reason
        raise ValueError(f"Trello API error ({action}): {resp.status_code} — {detail}")


# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------

def get_workspaces(api_key, token):
    """GET /1/members/me/organizations → [{id, displayName}]"""
    resp = requests.get(
        f"{TRELLO_API}/members/me/organizations",
        params={**_auth_params(api_key, token), "fields": "id,displayName"},
        timeout=15,
    )
    _check(resp, "get_workspaces")
    return [{"id": w["id"], "displayName": w.get("displayName", "")} for w in resp.json()]


def get_boards(api_key, token, workspace_id=None):
    """
    GET boards for a workspace or for the authenticated member.

    Returns [{id, name, closed}] — only open boards.
    """
    if workspace_id:
        url = f"{TRELLO_API}/organizations/{workspace_id}/boards"
    else:
        url = f"{TRELLO_API}/members/me/boards"
    resp = requests.get(
        url,
        params={**_auth_params(api_key, token), "fields": "id,name,closed", "filter": "open"},
        timeout=15,
    )
    _check(resp, "get_boards")
    return [{"id": b["id"], "name": b.get("name", "")} for b in resp.json() if not b.get("closed")]


def get_lists(api_key, token, board_id):
    """GET /1/boards/<board_id>/lists → [{id, name}] — only open lists."""
    resp = requests.get(
        f"{TRELLO_API}/boards/{board_id}/lists",
        params={**_auth_params(api_key, token), "filter": "open", "fields": "id,name"},
        timeout=15,
    )
    _check(resp, "get_lists")
    return [{"id": l["id"], "name": l.get("name", "")} for l in resp.json()]


# ---------------------------------------------------------------------------
# Create operations
# ---------------------------------------------------------------------------

def create_board(api_key, token, name, workspace_id=None):
    """POST /1/boards/ → {id, name}"""
    params = {**_auth_params(api_key, token), "name": name, "defaultLists": "false"}
    if workspace_id:
        params["idOrganization"] = workspace_id
    resp = requests.post(f"{TRELLO_API}/boards/", params=params, timeout=15)
    _check(resp, "create_board")
    data = resp.json()
    return {"id": data["id"], "name": data.get("name", name)}


def create_list(api_key, token, name, board_id):
    """POST /1/lists → {id, name}"""
    params = {**_auth_params(api_key, token), "name": name, "idBoard": board_id}
    resp = requests.post(f"{TRELLO_API}/lists", params=params, timeout=15)
    _check(resp, "create_list")
    data = resp.json()
    return {"id": data["id"], "name": data.get("name", name)}


# ---------------------------------------------------------------------------
# Export — push cards with checklists
# ---------------------------------------------------------------------------

def push_cards(api_key, token, list_id, items):
    """
    Create cards on the given list with optional checklists.

    items — [{title, description?, children?: [{title, description?}]}]

    Returns [{card_id, title, url, checklist_items?}].
    """
    results = []
    auth = _auth_params(api_key, token)

    for item in items:
        # Create card
        card_resp = requests.post(
            f"{TRELLO_API}/cards",
            params={
                **auth,
                "idList": list_id,
                "name": item.get("title", "Untitled"),
                "desc": item.get("description", ""),
            },
            timeout=15,
        )
        _check(card_resp, "create_card")
        card = card_resp.json()

        result = {
            "card_id": card["id"],
            "title": card.get("name", ""),
            "url": card.get("shortUrl", ""),
        }

        # Create checklist if children exist
        children = item.get("children") or []
        if children:
            cl_resp = requests.post(
                f"{TRELLO_API}/checklists",
                params={**auth, "idCard": card["id"], "name": "Tasks"},
                timeout=15,
            )
            _check(cl_resp, "create_checklist")
            checklist_id = cl_resp.json()["id"]

            checklist_items = []
            for child in children:
                ci_resp = requests.post(
                    f"{TRELLO_API}/checklists/{checklist_id}/checkItems",
                    params={**auth, "name": child.get("title", "")},
                    timeout=15,
                )
                _check(ci_resp, "create_checkItem")
                checklist_items.append(ci_resp.json().get("name", ""))
            result["checklist_items"] = checklist_items

        results.append(result)

    return results

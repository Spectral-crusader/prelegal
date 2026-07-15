"""Sign up, sign in, sign out, and who am I.

The session token travels in an httpOnly cookie, so the browser attaches it to
every fetch and no script can read it. The frontend is a static export with no
server of its own, which is why identity is decided here rather than in a Next
route handler.
"""

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field

from .. import auth
from ..auth import COOKIE, CurrentUser, User

router = APIRouter(prefix="/api")


class Credentials(BaseModel):
    """Registration and sign-in take the same two fields.

    The minimum length is enforced on the way in rather than by the UI alone,
    which is the only place it cannot be skipped.
    """

    email: EmailStr
    password: str = Field(min_length=8)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="lax",
        path="/",
        # Deliberately not `secure=True`: the app is served over plain HTTP on
        # localhost, and a secure cookie would never be sent back — auth would
        # look broken for no visible reason. Set it once this runs behind TLS.
    )


@router.post("/auth/signup", status_code=201)
def signup(body: Credentials, response: Response) -> User:
    """Register and sign in, in one step — there is nothing to verify against."""
    try:
        user = auth.create_user(body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _set_cookie(response, auth.start_session(user.id))
    return user


@router.post("/auth/signin")
def signin(body: Credentials, response: Response) -> User:
    user = auth.authenticate(body.email, body.password)
    # One message for both a wrong password and an unknown email: saying which
    # would tell an attacker whether an address has an account here.
    if user is None:
        raise HTTPException(status_code=401, detail="incorrect email or password")
    _set_cookie(response, auth.start_session(user.id))
    return user


@router.post("/auth/signout", status_code=204)
def signout(response: Response, prelegal_session: str | None = Cookie(default=None)) -> None:
    """Drop the session and the cookie. Safe to call when not signed in."""
    if prelegal_session:
        auth.end_session(prelegal_session)
    response.delete_cookie(COOKIE, path="/")


@router.get("/me")
def me(user: User = CurrentUser) -> User:
    """Who the session belongs to. 401 when there isn't one — the frontend's guard."""
    return user

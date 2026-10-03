from app.controllers.mappers import to_user_out
from app.db.models import User
from app.db.uow import UnitOfWork
from app.schemas.auth import UserOut


class UserController:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def me(self, user: User) -> UserOut:
        providers = await self._uow.oauth_identities.providers_for_user(user.id)
        return to_user_out(user, providers)

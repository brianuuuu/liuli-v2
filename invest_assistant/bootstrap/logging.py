import logging

from invest_assistant.bootstrap.config import get_settings


def configure_logging() -> None:
    logging.basicConfig(level=get_settings().log_level)
